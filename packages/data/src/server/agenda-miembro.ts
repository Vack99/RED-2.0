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
  parseDay,
  sameDay,
  semanaLunSab,
  toIsoDay,
} from "@gym/format";

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
 * It reuses @gym/domain's state ladder and @gym/format wholesale, deriving occupancy
 * through the same 0-active projection every agenda consumer uses today (booking, a
 * later slice, repoints that projection — this reader inherits it untouched). The
 * DTO is display-ready: hora / duración / weekday / dnum are formatted server-side
 * in the gym tz, so the client island is pure presentation with no tz logic.
 */

export interface SesionMiembroDTO {
  id: string;
  tipo: string;
  /** Coach names joined " · ", or "Por asignar" when none are assigned. */
  coaches: string;
  /** Gym-local wall clock "HH:MM". */
  hora: string;
  /** "60 min". */
  duracionLabel: string;
  estado: EstadoSesion;
  disponibles: number;
  capacidad: number;
  /** 0–100, the occupancy bar width. Reads 0 until booking lands (0-active projection). */
  ocupacionPct: number;
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

interface SesionMiembroRaw {
  id: string;
  startsAt: Date;
  duracionMin: number;
  capacidad: number;
  activos: number;
  tipo: string;
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

  const [tiposRes, joinsRes] = await Promise.all([
    supabase.from("class_type").select("id, name").in("id", tipoIds),
    supabase.from("class_session_coach").select("session_id, coach_id").in("session_id", sessionIds),
  ]);
  if (tiposRes.error) throw tiposRes.error;
  if (joinsRes.error) throw joinsRes.error;

  const tipoById = new Map((tiposRes.data ?? []).map((t) => [t.id, t.name]));
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

  return rows.map((r) => ({
    id: r.id,
    startsAt: new Date(r.starts_at),
    duracionMin: r.duration_min,
    capacidad: r.capacity,
    // Occupancy is DERIVED from active reservations (ADR-0010 §3); booking (#57)
    // repoints this to the real count. Read-only until then, so 0.
    activos: 0,
    tipo: tipoById.get(r.class_type_id) ?? "—",
    coaches: coachesBySession.get(r.id) ?? [],
  }));
}

function toDTO(s: SesionMiembroRaw, estado: EstadoSesion, tz: string): SesionMiembroDTO {
  return {
    id: s.id,
    tipo: s.tipo,
    coaches: s.coaches.length ? s.coaches.join(" · ") : "Por asignar",
    hora: horaEnZona(s.startsAt, tz),
    duracionLabel: `${s.duracionMin} min`,
    estado,
    disponibles: disponibles(s.capacidad, s.activos),
    capacidad: s.capacidad,
    ocupacionPct: Math.round(ratioOcupacion(s.capacidad, s.activos) * 100),
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
