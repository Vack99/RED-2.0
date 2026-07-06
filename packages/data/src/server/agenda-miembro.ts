import "server-only";

import { cache } from "react";

import { derivarEstadosDia, disponibles, ratioOcupacion } from "@gym/domain/rules";
import type { EstadoSesion } from "@gym/domain/types";
import {
  addDays,
  DOW,
  fechaEnZona,
  horaEnZona,
  hoyEnZona,
  inicioSemana,
  instanteEnZona,
  MON,
  MONTHS_FULL,
  parseDay,
  sameDay,
  semanaLunSab,
  toIsoDay,
} from "@gym/format";

import { contarActivos } from "./ocupacion";
import { createClient, type SupabaseServer } from "./supabase";

/**
 * The MEMBER-facing agenda reader (PRD #49 S3) — the seam BESIDE the staff-gated
 * getAgendaSemana (agenda.ts). Two auth contexts, not duplication (the PRD's named
 * approved exception): this one has NO operator check and NEVER materializes (that
 * RPC is staff_gym()-gated). RLS is the only gate — the member's gym is resolved
 * from their own `gym_membership` (self-read policy, ADR-0013 §4), so an anon or
 * non-member caller reads no membership row and gets no agenda; the member reads
 * only sessions of the gym they belong to (class_session's is_member_of SELECT).
 *
 * It reuses @gym/domain's state ladder and @gym/format wholesale. Occupancy derives
 * through the single `contarActivos` seam (slice #57 repointed it from the 0-active
 * projection to the real count). The DTO is display-ready: hora / duración / weekday /
 * dnum are formatted server-side in the gym tz, and the sala / nivel / descripción the
 * booking summary sheet renders ride along, so the client island is pure presentation
 * with no tz logic. `miReserva` flags the member's own active booking per session.
 */

export interface SesionMiembroDTO {
  id: string;
  tipo: string;
  /** Coach names joined " · ", or "Por asignar" when none are assigned. */
  coaches: string;
  /** Gym-local wall clock "HH:MM" (start). */
  hora: string;
  /** Gym-local wall clock "HH:MM" (start + duration) — the sheet range + "termina". */
  horaFin: string;
  /** "60 min". */
  duracionLabel: string;
  estado: EstadoSesion;
  disponibles: number;
  capacidad: number;
  /** 0–100, the occupancy bar width (derived from the real active count, slice #57). */
  ocupacionPct: number;
  /** Class-type detail for the booking summary sheet (mock: rvs-grid + rvs-desc). */
  sala: string | null;
  nivel: string | null;
  descripcion: string | null;
  /** True when the signed-in member already holds an active reservation for this session. */
  miReserva: boolean;
}

export interface DiaMiembroDTO {
  /** "YYYY-MM-DD" (gym-local calendar day). */
  iso: string;
  /** es-MX weekday label, LUN…SÁB. */
  weekday: string;
  /** Day-of-month number. */
  dnum: number;
  /** True for the gym's current calendar day (the day the picker opens on). */
  esHoy: boolean;
  sesiones: SesionMiembroDTO[];
}

export interface AgendaSemanaMiembroDTO {
  /** Six entries, Lun–Sáb. */
  dias: DiaMiembroDTO[];
}

export interface SaldoMiembroDTO {
  /** Ilimitado (clases_restantes IS NULL) — the booking sheet omits the finite note. */
  ilimitado: boolean;
  /** Classes left on a finite plan; null for ilimitado. Drives "usa 1 de tus N clases". */
  clasesRestantes: number | null;
}

interface SesionMiembroRaw {
  id: string;
  startsAt: Date;
  duracionMin: number;
  capacidad: number;
  activos: number;
  tipo: string;
  sala: string | null;
  nivel: string | null;
  descripcion: string | null;
  miReserva: boolean;
  coaches: string[];
}

/** The member's gym (id + tz) from their `gym_membership` self-read — the RLS gate.
 *  One membership per login (one login = one gym); an anon/non-member caller reads
 *  none, so the reader throws and the page renders its signed-out state. */
async function resolverMiembroTz(supabase: SupabaseServer): Promise<string> {
  const { data: membership } = await supabase
    .from("gym_membership")
    .select("gym_id")
    .limit(1)
    .maybeSingle();
  if (!membership) throw new Error("Sin membresía de gimnasio");

  const { data: gym } = await supabase
    .from("gym")
    .select("timezone")
    .eq("id", membership.gym_id)
    .maybeSingle();
  if (!gym) throw new Error("Gimnasio no encontrado");

  return gym.timezone;
}

/** Non-cancelled sessions in `[low, high)` (an absolute UTC range), joined to
 *  class_type + coaches — three plain reads assembled in JS, the DAL's convention.
 *  A leaner projection than the staff reader (no especial/room columns a member
 *  card never renders); the coach-join assembly is the honest, contained cost of
 *  the two-auth-context separation. Ordered by starts_at — derivarEstadosDia's
 *  required order. */
async function fetchSesionesMiembro(
  supabase: SupabaseServer,
  low: Date,
  high: Date,
): Promise<SesionMiembroRaw[]> {
  const { data: sesiones, error } = await supabase
    .from("class_session")
    .select("id, class_type_id, starts_at, duration_min, capacity")
    .is("cancelled_at", null)
    .gte("starts_at", low.toISOString())
    .lt("starts_at", high.toISOString())
    .order("starts_at");
  if (error) throw error;

  const rows = sesiones ?? [];
  if (rows.length === 0) return [];

  const tipoIds = [...new Set(rows.map((r) => r.class_type_id))];
  const sessionIds = rows.map((r) => r.id);

  const [tiposRes, joinsRes, misReservasRes] = await Promise.all([
    supabase.from("class_type").select("id, name, sala, level, description").in("id", tipoIds),
    supabase.from("class_session_coach").select("session_id, coach_id").in("session_id", sessionIds),
    // The member's OWN active reservations among these sessions (RLS returns only their rows).
    supabase
      .from("reservation")
      .select("class_session_id")
      .in("class_session_id", sessionIds)
      .in("status", ["reservada", "asistida"]),
  ]);
  if (tiposRes.error) throw tiposRes.error;
  if (joinsRes.error) throw joinsRes.error;
  if (misReservasRes.error) throw misReservasRes.error;

  const tipoById = new Map((tiposRes.data ?? []).map((t) => [t.id, t]));
  const misReservas = new Set((misReservasRes.data ?? []).map((r) => r.class_session_id));
  const activosBySession = await contarActivos(supabase, sessionIds);
  const joins = joinsRes.data ?? [];
  const coachIds = [...new Set(joins.map((j) => j.coach_id))];

  const coachesRes = coachIds.length
    ? await supabase.from("coach").select("id, name").in("id", coachIds)
    : { data: [] as { id: string; name: string }[], error: null };
  if (coachesRes.error) throw coachesRes.error;
  const coachById = new Map((coachesRes.data ?? []).map((c) => [c.id, c.name]));

  const coachesBySession = new Map<string, string[]>();
  for (const j of joins) {
    const nombre = coachById.get(j.coach_id);
    if (!nombre) continue;
    const list = coachesBySession.get(j.session_id) ?? [];
    list.push(nombre);
    coachesBySession.set(j.session_id, list);
  }

  return rows.map((r) => {
    const tipo = tipoById.get(r.class_type_id);
    return {
      id: r.id,
      startsAt: new Date(r.starts_at),
      duracionMin: r.duration_min,
      capacidad: r.capacity,
      // Occupancy DERIVED from active reservations via the single seam (ADR-0010 §3).
      activos: activosBySession.get(r.id) ?? 0,
      tipo: tipo?.name ?? "—",
      sala: tipo?.sala ?? null,
      nivel: tipo?.level ?? null,
      descripcion: tipo?.description ?? null,
      miReserva: misReservas.has(r.id),
      coaches: coachesBySession.get(r.id) ?? [],
    };
  });
}

function toDTO(s: SesionMiembroRaw, estado: EstadoSesion, tz: string): SesionMiembroDTO {
  return {
    id: s.id,
    tipo: s.tipo,
    coaches: s.coaches.length ? s.coaches.join(" · ") : "Por asignar",
    hora: horaEnZona(s.startsAt, tz),
    horaFin: horaEnZona(new Date(s.startsAt.getTime() + s.duracionMin * 60_000), tz),
    duracionLabel: `${s.duracionMin} min`,
    estado,
    disponibles: disponibles(s.capacidad, s.activos),
    capacidad: s.capacidad,
    ocupacionPct: Math.round(ratioOcupacion(s.capacidad, s.activos) * 100),
    sala: s.sala,
    nivel: s.nivel,
    descripcion: s.descripcion,
    miReserva: s.miReserva,
  };
}

/**
 * A member's week (gym tz), grouped Lun–Sáb, with per-session derived estado +
 * occupancy. `fechaIso` (any day in the target week) defaults to the gym's current
 * day, so the page opens on "this week". `client` injectable (ADR-0001). Memoized
 * per request via React `cache()`. NEVER materializes — a member reads only what
 * staff have already scheduled.
 */
export const getAgendaSemanaMiembro = cache(
  async (fechaIso?: string, client?: SupabaseServer): Promise<AgendaSemanaMiembroDTO> => {
    const supabase = client ?? (await createClient());
    const tz = await resolverMiembroTz(supabase);

    const hoy = hoyEnZona(tz);
    const dia = fechaIso ? parseDay(fechaIso) : hoy;
    const lunes = inicioSemana(dia);

    const low = instanteEnZona(lunes, "00:00", tz);
    const high = instanteEnZona(addDays(lunes, 6), "00:00", tz);
    const crudas = await fetchSesionesMiembro(supabase, low, high);

    const ahora = new Date();
    const dias = semanaLunSab(lunes).map((fechaDia) => {
      const delDia = crudas.filter((s) => sameDay(fechaEnZona(s.startsAt.toISOString(), tz), fechaDia));
      const estados = derivarEstadosDia(delDia, ahora);
      return {
        iso: toIsoDay(fechaDia),
        weekday: DOW[fechaDia.getDay()],
        dnum: fechaDia.getDate(),
        esHoy: sameDay(fechaDia, hoy),
        sesiones: delDia.map((s, i) => toDTO(s, estados[i], tz)),
      };
    });

    return { dias };
  },
);

/**
 * The signed-in member's class balance for the booking summary sheet's finite-plan
 * note. RLS-scoped self-read of their own `clientes` row (clientes_member_select,
 * auth_user_id = auth.uid()); `clases_restantes IS NULL` = ilimitado (ADR-0004). A
 * caller with no cliente row (edge) reads as ilimitado-safe `{ ilimitado: false,
 * clasesRestantes: 0 }`. `client` injectable (ADR-0001); memoized per request.
 */
export const getSaldoMiembro = cache(
  async (client?: SupabaseServer): Promise<SaldoMiembroDTO> => {
    const supabase = client ?? (await createClient());
    const { data, error } = await supabase
      .from("clientes")
      .select("clases_restantes")
      .limit(1)
      .maybeSingle();
    if (error) throw error;
    if (!data) return { ilimitado: false, clasesRestantes: 0 };
    return { ilimitado: data.clases_restantes === null, clasesRestantes: data.clases_restantes };
  },
);

/**
 * One of the signed-in member's upcoming bookings, display-ready for the Perfil
 * overlay's "Próximas reservas" card (mock: mr-card). `sessionId` drives the cancel
 * RPC + the .ics calendar action; `inicioIso` / `finIso` are the absolute UTC bounds
 * that action needs. hora / date / duración are formatted server-side in the gym tz.
 */
export interface ProximaReservaDTO {
  sessionId: string;
  tipo: string;
  /** Coach names joined " · ", or "Por asignar". */
  coaches: string;
  /** Gym-local "HH:MM" start. */
  hora: string;
  /** "60 min". */
  duracionLabel: string;
  /** Card date rail line 1: "MIÉ 17" (gym-local weekday + day-of-month). */
  fechaCorta: string;
  /** Card date rail line 2: "JUN" (gym-local month). */
  mesCorto: string;
  /** Absolute UTC start / end — the calendar (.ics) action's DTSTART/DTEND. */
  inicioIso: string;
  finIso: string;
  /** Room label for the .ics location, or null. */
  sala: string | null;
}

/**
 * The Perfil overlay's member data (slice #58): the identity "miembro desde" line and
 * the upcoming bookings. `desde` is the gym-local month-year the member's cliente row
 * was created (null when unknown). `reservas` are the member's own ACTIVE (reservada)
 * bookings for sessions that have NOT yet started, soonest first — a plain RLS read of
 * their own reservation rows (reservation_member_select), the same own-only surface the
 * agenda's `miReserva` flag uses. Occupancy is irrelevant here (these are the member's
 * own held spots), so this reader does NOT touch the contarActivos seam.
 */
export interface PerfilResumenMiembroDTO {
  desde: string | null;
  reservas: ProximaReservaDTO[];
}

export const getPerfilResumenMiembro = cache(
  async (client?: SupabaseServer): Promise<PerfilResumenMiembroDTO> => {
    const supabase = client ?? (await createClient());
    const tz = await resolverMiembroTz(supabase);

    const { data: cli } = await supabase
      .from("clientes")
      .select("created_at")
      .limit(1)
      .maybeSingle();
    const desde = cli?.created_at
      ? (() => {
          const d = fechaEnZona(cli.created_at, tz);
          return `${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`;
        })()
      : null;

    return { desde, reservas: await fetchProximasReservas(supabase, tz) };
  },
);

/** The member's own reservada bookings for not-yet-started sessions, soonest first,
 *  joined to class_type + coaches — the same three-plain-reads assembly the week reader
 *  uses, keyed here off the reservation rows instead of a week window. */
async function fetchProximasReservas(
  supabase: SupabaseServer,
  tz: string,
): Promise<ProximaReservaDTO[]> {
  const { data: reservas, error } = await supabase
    .from("reservation")
    .select("class_session_id")
    .eq("status", "reservada");
  if (error) throw error;
  const sessionIds = [...new Set((reservas ?? []).map((r) => r.class_session_id))];
  if (sessionIds.length === 0) return [];

  const { data: sesiones, error: sesErr } = await supabase
    .from("class_session")
    .select("id, class_type_id, starts_at, duration_min")
    .in("id", sessionIds)
    .is("cancelled_at", null)
    .gte("starts_at", new Date().toISOString())
    .order("starts_at");
  if (sesErr) throw sesErr;
  const rows = sesiones ?? [];
  if (rows.length === 0) return [];

  const tipoIds = [...new Set(rows.map((r) => r.class_type_id))];
  const [tiposRes, joinsRes] = await Promise.all([
    supabase.from("class_type").select("id, name, sala").in("id", tipoIds),
    supabase.from("class_session_coach").select("session_id, coach_id").in("session_id", rows.map((r) => r.id)),
  ]);
  if (tiposRes.error) throw tiposRes.error;
  if (joinsRes.error) throw joinsRes.error;

  const tipoById = new Map((tiposRes.data ?? []).map((t) => [t.id, t]));
  const joins = joinsRes.data ?? [];
  const coachIds = [...new Set(joins.map((j) => j.coach_id))];
  const coachesRes = coachIds.length
    ? await supabase.from("coach").select("id, name").in("id", coachIds)
    : { data: [] as { id: string; name: string }[], error: null };
  if (coachesRes.error) throw coachesRes.error;
  const coachById = new Map((coachesRes.data ?? []).map((c) => [c.id, c.name]));

  const coachesBySession = new Map<string, string[]>();
  for (const j of joins) {
    const nombre = coachById.get(j.coach_id);
    if (!nombre) continue;
    const list = coachesBySession.get(j.session_id) ?? [];
    list.push(nombre);
    coachesBySession.set(j.session_id, list);
  }

  return rows.map((r) => {
    const inicio = new Date(r.starts_at);
    const local = fechaEnZona(r.starts_at, tz);
    const tipo = tipoById.get(r.class_type_id);
    const coaches = coachesBySession.get(r.id) ?? [];
    return {
      sessionId: r.id,
      tipo: tipo?.name ?? "—",
      coaches: coaches.length ? coaches.join(" · ") : "Por asignar",
      hora: horaEnZona(inicio, tz),
      duracionLabel: `${r.duration_min} min`,
      fechaCorta: `${DOW[local.getDay()]} ${local.getDate()}`,
      mesCorto: MON[local.getMonth()],
      inicioIso: inicio.toISOString(),
      finIso: new Date(inicio.getTime() + r.duration_min * 60_000).toISOString(),
      sala: tipo?.sala ?? null,
    };
  });
}
