import "server-only";

import { cache } from "react";

import { derivarEstadoSesion, disponibles, ratioOcupacion } from "@gym/domain/rules";
import type { EstadoSesion } from "@gym/domain/types";
import {
  addDays,
  DOW,
  fechaEnZona,
  horaEnZona,
  hoyEnZona,
  instanteEnZona,
  MON,
  MONTHS_FULL,
  sameDay,
  WEEKDAYS_FULL,
} from "@gym/format";
import { z } from "zod";

import { resolverMiembroGym } from "./inquilino";
import { contarActivosMiembro } from "./ocupacion";
import { createClient, type SupabaseServer } from "./supabase";

/**
 * The clase-detail + Confirmada + favorita member seam (PRD #49 S3, slice #59). Three
 * reads and one write, all RLS/RPC-gated to the signed-in member's own gym/rows:
 *   * getClaseDetalleMiembro — the full class-detail page (mock: `clase` slot): status,
 *     datos, coaches (bio/spec), la sesión, qué trabajamos (workblocks), qué traer, and
 *     the cupo roster of REAL attendee initials via the narrow `roster_clase` definer
 *     (a member cannot SELECT other members' reservation rows, so the roster is a
 *     privileged initials-only read — the sibling of contar_reservas_activas).
 *   * getConfirmacionReserva — the standalone Confirmada page (mock: `confirmada` slot),
 *     ALWAYS fed by a real active booking; returns null when the member holds no active
 *     reservation for the session, so the page redirects rather than paint fallback data.
 *   * toggleFavoritoTipo — the heart's one write path over the self-scoped
 *     `toggle_favorito_tipo` RPC (members hold no direct clientes UPDATE).
 * Occupancy derives through the member-only `contarActivosMiembro` seam (owner ruling
 * 2026-08-03) — walk-ins excluded, never the staff/roster `contarActivos`, so a door
 * mark can never read as LLENO to a member who never booked anything. Every read reuses @gym/domain's
 * state ladder + @gym/format wholesale; the DTOs are display-ready so the client islands
 * are pure presentation.
 */

export interface CoachDetalleDTO {
  nombre: string;
  iniciales: string;
  /** Specialty line under the name ("Acondicionamiento metabólico"), or a neutral fallback. */
  especialidad: string;
  bio: string | null;
}

export interface ClaseDetalleDTO {
  sessionId: string;
  classTypeId: string;
  tipo: string;
  estado: EstadoSesion;
  /** Header context line "MIÉ 17 · 18:15". */
  contexto: string;
  /** "Miércoles 17 de junio". */
  fechaLarga: string;
  /** Gym-local "HH:MM" start / end. */
  hora: string;
  horaFin: string;
  /** "60 min". */
  duracionLabel: string;
  sala: string | null;
  nivel: string | null;
  descripcion: string | null;
  coaches: CoachDetalleDTO[];
  /** Ordered "qué trabajamos" segments — mono label + optional detail (2-column). */
  bloques: { etiqueta: string; valor: string | null }[];
  /** Ordered "qué traer" checklist labels. */
  porTraer: string[];
  capacidad: number;
  disponibles: number;
  /** Seats taken (= active reservations); drives the pips + "N de M lugares tomados". */
  ocupados: number;
  /** 0–100 occupancy bar width. */
  ocupacionPct: number;
  /** The member's own active booking for this session. */
  miReserva: boolean;
  /** The member already holds ANOTHER active booking on this session's gym-local day
   *  (#89 W3) — drives the "esta usará otra de tus N clases" charge-consent nota, the
   *  same one the week's summary sheet shows. */
  otraReservaEseDia: boolean;
  /** Whether this session's gym-local day IS today — the nota says "hoy" only then. */
  esHoy: boolean;
  /** This class type is the member's favorite (heart filled + "Tu favorita"). */
  favorita: boolean;
  /** Real attendee initials (active reservations), display-minimum, order-stable. */
  roster: string[];
}

export interface ConfirmacionReservaDTO {
  sessionId: string;
  tipo: string;
  /** Coach names joined " · ", or "Por asignar". */
  coaches: string;
  /** "Miércoles 17 de junio". */
  fechaLarga: string;
  /** Ticket rail: "MIÉ 17". */
  fechaCorta: string;
  /** Ticket rail month: "JUN". */
  mesCorto: string;
  hora: string;
  horaFin: string;
  duracionLabel: string;
  sala: string | null;
  /** The gym's street address (gym_contact.address_line), or null when unset. */
  direccion: string | null;
  favorita: boolean;
  /** Absolute UTC bounds for the .ics calendar action. */
  inicioIso: string;
  finIso: string;
}

/** Two-letter display initials from a name ("Lucía Mora" → "LM"). */
function iniciales(nombre: string): string {
  const p = nombre.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? "")).toUpperCase();
}

function capitalizar(s: string): string {
  return s.length ? s[0].toUpperCase() + s.slice(1) : s;
}

function fechaLargaEnZona(local: Date): string {
  return `${capitalizar(WEEKDAYS_FULL[local.getDay()])} ${local.getDate()} de ${MONTHS_FULL[local.getMonth()]}`;
}

/** The gym's street address (gym_contact.address_line), or null when unset/no row. */
async function fetchDireccion(supabase: SupabaseServer, gymId: string): Promise<string | null> {
  const { data } = await supabase
    .from("gym_contact")
    .select("address_line")
    .eq("gym_id", gymId)
    .maybeSingle();
  return data?.address_line ?? null;
}

/** The signed-in member's favorite class-type id (self-read of their own clientes row),
 *  scoped to the host-reconciled `gymId` (#74) so a member with clientes rows in several gyms
 *  reads THIS gym's row — the same gym `resolverMiembroGym` picked — never the `limit(1)`
 *  roulette. RLS still scopes the read; `gym_id` only disambiguates among the caller's own rows. */
async function fetchFavoritoId(supabase: SupabaseServer, gymId: string): Promise<string | null> {
  const { data } = await supabase
    .from("clientes")
    .select("favorite_class_type_id")
    .eq("gym_id", gymId)
    .limit(1)
    .maybeSingle();
  return data?.favorite_class_type_id ?? null;
}

/** Coach names for a session, joined class_session_coach → coach, in insertion order. */
async function fetchCoaches(supabase: SupabaseServer, sessionId: string): Promise<CoachDetalleDTO[]> {
  const { data: joins } = await supabase
    .from("class_session_coach")
    .select("coach_id")
    .eq("session_id", sessionId);
  const coachIds = [...new Set((joins ?? []).map((j) => j.coach_id))];
  if (coachIds.length === 0) return [];
  const { data: coaches } = await supabase
    .from("coach")
    .select("id, name, initials, specialty, bio")
    .in("id", coachIds);
  const byId = new Map((coaches ?? []).map((c) => [c.id, c]));
  // Preserve the join order (the operator's coach order for the session).
  return coachIds
    .map((id) => byId.get(id))
    .filter((c): c is NonNullable<typeof c> => Boolean(c))
    .map((c) => ({
      nombre: c.name,
      iniciales: c.initials || iniciales(c.name),
      especialidad: c.specialty ?? "Coach",
      bio: c.bio,
    }));
}

const sessionIdSchema = z.string().uuid();

/**
 * The full class-detail page for the signed-in member. Returns null when the session
 * isn't visible (RLS) or the id is malformed, so the page can render notFound(). Estado
 * is derived off the real active count; the roster is the privileged initials-only read.
 * `client` injectable (ADR-0001); memoized per request.
 */
export const getClaseDetalleMiembro = cache(
  async (rawSessionId: string, client?: SupabaseServer): Promise<ClaseDetalleDTO | null> => {
    if (!sessionIdSchema.safeParse(rawSessionId).success) return null;
    const supabase = client ?? (await createClient());
    const miembro = await resolverMiembroGym(supabase);
    if (!miembro) return null;
    const { id: gymId, tz } = miembro;

    const { data: sesion } = await supabase
      .from("class_session")
      .select("id, class_type_id, starts_at, duration_min, capacity, cancelled_at")
      .eq("id", rawSessionId)
      .eq("gym_id", gymId)
      .is("cancelled_at", null)
      .maybeSingle();
    if (!sesion) return null;

    const { data: tipo } = await supabase
      .from("class_type")
      .select("id, name, sala, level, description")
      .eq("id", sesion.class_type_id)
      .maybeSingle();
    if (!tipo) return null;

    // The session's gym-local calendar day as an absolute UTC window — the frame BOTH
    // same-day facts are answered in (`otraReservaEseDia`, `esHoy`).
    const local = fechaEnZona(sesion.starts_at, tz);
    const diaLow = instanteEnZona(local, "00:00", tz);
    const diaHigh = instanteEnZona(addDays(local, 1), "00:00", tz);

    const [bloquesRes, traerRes, coaches, sesionesDiaRes, activosMap, favoritoId, roster] =
      await Promise.all([
        supabase
          .from("class_type_workblock")
          .select("label, value")
          .eq("class_type_id", tipo.id)
          .order("sort_order"),
        supabase
          .from("class_type_bring_item")
          .select("label")
          .eq("class_type_id", tipo.id)
          .order("sort_order"),
        fetchCoaches(supabase, sesion.id),
        // The gym's OTHER sessions that day (#89 W3). This read replaced the old
        // single-session `reservation` lookup: `miReserva` and "do I already have a class
        // that day" are the same question over a wider window, so they are answered by one
        // reservation read below instead of two. Bounded to the day on purpose — the
        // alternative (the member's own reservation rows, unfiltered) grows with their whole
        // `asistida` history.
        supabase
          .from("class_session")
          .select("id")
          .eq("gym_id", gymId)
          .is("cancelled_at", null)
          .gte("starts_at", diaLow.toISOString())
          .lt("starts_at", diaHigh.toISOString()),
        contarActivosMiembro(supabase, [sesion.id]),
        fetchFavoritoId(supabase, gymId),
        supabase.rpc("roster_clase", { p_session_id: sesion.id }, { get: true }),
      ]);

    // The member's OWN active bookings among that day's sessions (RLS returns only their
    // rows). The day's ids already came from a gym-scoped query, so no second gym filter
    // can matter here. Costs one sequential hop, which is what buys the bounded window.
    const { data: misReservasDia } = await supabase
      .from("reservation")
      .select("class_session_id")
      .in("class_session_id", (sesionesDiaRes.data ?? []).map((s) => s.id))
      .in("status", ["reservada", "asistida"]);
    const reservadas = new Set((misReservasDia ?? []).map((r) => r.class_session_id));

    const inicio = new Date(sesion.starts_at);
    const fin = new Date(inicio.getTime() + sesion.duration_min * 60_000);
    const ocupados = activosMap.get(sesion.id) ?? 0;
    const estado = derivarEstadoSesion(
      { startsAt: inicio, activos: ocupados, capacidad: sesion.capacity },
      new Date(),
      false,
    );

    return {
      sessionId: sesion.id,
      classTypeId: tipo.id,
      tipo: tipo.name,
      estado,
      contexto: `${DOW[local.getDay()]} ${local.getDate()} · ${horaEnZona(inicio, tz)}`,
      fechaLarga: fechaLargaEnZona(local),
      hora: horaEnZona(inicio, tz),
      horaFin: horaEnZona(fin, tz),
      duracionLabel: `${sesion.duration_min} min`,
      sala: tipo.sala,
      nivel: tipo.level,
      descripcion: tipo.description,
      coaches,
      bloques: (bloquesRes.data ?? []).map((b) => ({ etiqueta: b.label, valor: b.value })),
      porTraer: (traerRes.data ?? []).map((b) => b.label),
      capacidad: sesion.capacity,
      disponibles: disponibles(sesion.capacity, ocupados),
      ocupados,
      ocupacionPct: Math.round(ratioOcupacion(sesion.capacity, ocupados) * 100),
      miReserva: reservadas.has(sesion.id),
      otraReservaEseDia: [...reservadas].some((id) => id !== sesion.id),
      esHoy: sameDay(local, hoyEnZona(tz)),
      favorita: favoritoId === tipo.id,
      roster: (roster.data ?? []).map((r) => r.iniciales),
    };
  },
);

/**
 * The Confirmada page's booking, ALWAYS a real active reservation. Returns null unless the
 * member holds a `reservada` booking for a not-yet-started, non-cancelled session — the
 * page redirects on null, so the mock's hardcoded fallback ticket never renders. `client`
 * injectable (ADR-0001); memoized per request.
 */
export const getConfirmacionReserva = cache(
  async (rawSessionId: string, client?: SupabaseServer): Promise<ConfirmacionReservaDTO | null> => {
    if (!sessionIdSchema.safeParse(rawSessionId).success) return null;
    const supabase = client ?? (await createClient());
    const miembro = await resolverMiembroGym(supabase);
    if (!miembro) return null;
    const { id: gymId, tz } = miembro;

    // The member's OWN active booking for this session (plain RLS read of their own rows).
    const { data: reserva } = await supabase
      .from("reservation")
      .select("id")
      .eq("class_session_id", rawSessionId)
      .eq("status", "reservada")
      .eq("gym_id", gymId)
      .maybeSingle();
    if (!reserva) return null;

    const { data: sesion } = await supabase
      .from("class_session")
      .select("id, class_type_id, starts_at, duration_min")
      .eq("id", rawSessionId)
      .eq("gym_id", gymId)
      .is("cancelled_at", null)
      .gte("starts_at", new Date().toISOString())
      .maybeSingle();
    if (!sesion) return null;

    const [{ data: tipo }, coaches, favoritoId, direccion] = await Promise.all([
      supabase.from("class_type").select("id, name, sala").eq("id", sesion.class_type_id).maybeSingle(),
      fetchCoaches(supabase, sesion.id),
      fetchFavoritoId(supabase, gymId),
      fetchDireccion(supabase, gymId),
    ]);
    if (!tipo) return null;

    const inicio = new Date(sesion.starts_at);
    const fin = new Date(inicio.getTime() + sesion.duration_min * 60_000);
    const local = fechaEnZona(sesion.starts_at, tz);

    return {
      sessionId: sesion.id,
      tipo: tipo.name,
      coaches: coaches.length ? coaches.map((c) => c.nombre).join(" · ") : "Por asignar",
      fechaLarga: fechaLargaEnZona(local),
      fechaCorta: `${DOW[local.getDay()]} ${local.getDate()}`,
      mesCorto: MON[local.getMonth()],
      hora: horaEnZona(inicio, tz),
      horaFin: horaEnZona(fin, tz),
      duracionLabel: `${sesion.duration_min} min`,
      sala: tipo.sala,
      direccion,
      favorita: favoritoId === tipo.id,
      inicioIso: inicio.toISOString(),
      finIso: fin.toISOString(),
    };
  },
);

/**
 * Toggle the member's favorite class type (the heart) over the atomic self-scoped
 * `toggle_favorito_tipo` RPC. The RPC owns the on/off flip, the single-favorite invariant,
 * and the tenant pin; this thin seam validates the id and returns the new favorite (null =
 * cleared). `client` injectable (ADR-0001).
 *
 * It runs the SAME host reconciliation every reader here uses (#219): the RPC used to pick its
 * own tenant with a bare `limit 1`, so a member with clientes rows in two gyms could write the
 * heart onto the other gym's row — or be refused with `Tipo de clase no encontrado` on their own
 * gym's class. It is handed the resolved gym, the same one `fetchFavoritoId` reads back.
 */
export type ToggleFavoritoResultado =
  | { ok: true; favorito: string | null }
  | { ok: false; error: string };

export async function toggleFavoritoTipo(
  rawClassTypeId: unknown,
  client?: SupabaseServer,
): Promise<ToggleFavoritoResultado> {
  const parsed = sessionIdSchema.safeParse(rawClassTypeId);
  if (!parsed.success) return { ok: false, error: "Tipo de clase inválido" };

  const supabase = client ?? (await createClient());
  const miembro = await resolverMiembroGym(supabase);
  if (!miembro) return { ok: false, error: "No eres miembro de este gimnasio" };
  const { data, error } = await supabase.rpc("toggle_favorito_tipo", {
    p_class_type_id: parsed.data,
    p_gym_id: miembro.id,
  });
  if (error) return { ok: false, error: error.message || "No se pudo actualizar tu favorita" };
  return { ok: true, favorito: data?.[0]?.favorito ?? null };
}
