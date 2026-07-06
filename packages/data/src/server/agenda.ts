import "server-only";

import { cache } from "react";
import { z } from "zod";

import {
  cupoValido,
  derivarEstadosDia,
  disponibles,
  duracionValida,
  horaValida,
  muestraEspecial,
  ratioOcupacion,
} from "@gym/domain/rules";
import type { EstadoSesion } from "@gym/domain/types";
import { addDays, fechaEnZona, inicioSemana, instanteEnZona, parseDay, sameDay, semanaLunSab, toIsoDay } from "@gym/format";

import { requireOperator } from "./_auth";
import { getOperatorGym } from "./gym";
import { contarActivos } from "./ocupacion";
import { createClient, type SupabaseServer } from "./supabase";

/**
 * The Agenda DAL (PRD #36 S5): day/week readers over `class_session` (ensure-
 * materialized per ADR-0010 — never read-time recurrence expansion) + the crear/
 * editar/cancelar mutation seams over the S1 atomic RPCs. No manual `gym_id`
 * filter anywhere — isolation is RLS-by-membership (ADR-0013); tz is always the
 * operator's gym (getOperatorGym), never a fixed constant.
 */

// ── Readers ───────────────────────────────────────────────────────────────

export interface CoachLiteDTO {
  id: string;
  nombre: string;
}

export interface SesionAgendaDTO {
  id: string;
  startsAt: Date;
  duracionMin: number;
  capacidad: number;
  /** Active reservations for this session (`reservada | asistida`), the derived-
   *  occupancy count — slice #57 repointed this from the 0-projection to the real
   *  count via the single `contarActivos` seam. `disponibles`/`estado` derive from it. */
  activos: number;
  disponibles: number;
  estado: EstadoSesion;
  tipo: string;
  esEspecial: boolean;
  nombreEspecial: string | null;
  muestraEspecial: boolean;
  roomId: string | null;
  coaches: CoachLiteDTO[];
}

export interface ResumenDia {
  clases: number;
  reservas: number;
}

export interface AgendaDiaDTO {
  fecha: Date;
  sesiones: SesionAgendaDTO[];
  resumen: ResumenDia;
}

export interface DiaAgendaSemanaDTO {
  fecha: Date;
  sesiones: SesionAgendaDTO[];
  resumen: ResumenDia;
  ratioOcupacion: number;
}

export interface AgendaSemanaDTO {
  lunes: Date;
  dias: DiaAgendaSemanaDTO[];
  resumenSemana: ResumenDia & { ratioOcupacion: number };
}

interface SesionRaw {
  id: string;
  startsAt: Date;
  duracionMin: number;
  capacidad: number;
  activos: number;
  tipo: string;
  esEspecial: boolean;
  nombreEspecial: string | null;
  roomId: string | null;
  coaches: CoachLiteDTO[];
}

/** Fetch non-cancelled sessions in `[low, high)` (an absolute UTC instant range),
 *  joined to class_type + coaches — three plain reads assembled in JS (no
 *  embedded PostgREST select), matching the rest of the DAL (e.g. getAsistenciasHoy).
 *  Ordered by startsAt ascending — the order `derivarEstadosDia` requires. */
async function fetchSesionesEnRango(
  supabase: SupabaseServer,
  low: Date,
  high: Date,
): Promise<SesionRaw[]> {
  const { data: sesiones, error } = await supabase
    .from("class_session")
    .select("id, class_type_id, starts_at, duration_min, capacity, is_special, special_name, room_id")
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

  const coachesBySession = new Map<string, CoachLiteDTO[]>();
  for (const j of joins) {
    const nombre = coachById.get(j.coach_id);
    if (!nombre) continue;
    const list = coachesBySession.get(j.session_id) ?? [];
    list.push({ id: j.coach_id, nombre });
    coachesBySession.set(j.session_id, list);
  }

  const activosBySession = await contarActivos(supabase, sessionIds);

  return rows.map((r) => ({
    id: r.id,
    startsAt: new Date(r.starts_at),
    duracionMin: r.duration_min,
    capacidad: r.capacity,
    activos: activosBySession.get(r.id) ?? 0,
    tipo: tipoById.get(r.class_type_id) ?? "—",
    esEspecial: r.is_special,
    nombreEspecial: r.special_name,
    roomId: r.room_id,
    coaches: coachesBySession.get(r.id) ?? [],
  }));
}

function toDTO(s: SesionRaw, estado: EstadoSesion): SesionAgendaDTO {
  return {
    id: s.id,
    startsAt: s.startsAt,
    duracionMin: s.duracionMin,
    capacidad: s.capacidad,
    activos: s.activos,
    disponibles: disponibles(s.capacidad, s.activos),
    estado,
    tipo: s.tipo,
    esEspecial: s.esEspecial,
    nombreEspecial: s.nombreEspecial,
    muestraEspecial: muestraEspecial(estado, s.esEspecial),
    roomId: s.roomId,
    coaches: s.coaches,
  };
}

function resumenDe(dtos: SesionAgendaDTO[]): ResumenDia {
  return { clases: dtos.length, reservas: dtos.reduce((n, d) => n + d.activos, 0) };
}

/** ratioOcupacion, aggregated over a set of sessions, guarding the empty-day/week
 *  div-by-zero `ratioOcupacion` itself doesn't guard (its per-session callers never
 *  hit capacidad === 0 — cupoValido's 4-40 floor; an aggregate over ZERO sessions
 *  can). */
function ratioAgregada(dtos: SesionAgendaDTO[]): number {
  const capacidad = dtos.reduce((n, d) => n + d.capacidad, 0);
  if (capacidad === 0) return 0;
  const activos = dtos.reduce((n, d) => n + d.activos, 0);
  return ratioOcupacion(capacidad, activos);
}

async function ensureSemanaMaterializada(supabase: SupabaseServer, lunes: Date): Promise<void> {
  await supabase.rpc("ensure_week_materialized", { p_week_start: toIsoDay(lunes) });
}

/** A day's sessions (gym tz), joined to class_type + coaches, with derived
 *  occupancy/estado and the day summary inputs. Ensures the containing week is
 *  materialized first (ADR-0010 — never read-time recurrence expansion). */
export const getAgendaDia = cache(
  async (fechaIso: string, client?: SupabaseServer): Promise<AgendaDiaDTO> => {
    const supabase = client ?? (await createClient());
    await requireOperator(supabase);
    const { timezone: tz } = await getOperatorGym(supabase);

    const dia = parseDay(fechaIso);
    const lunes = inicioSemana(dia);
    await ensureSemanaMaterializada(supabase, lunes);

    const low = instanteEnZona(dia, "00:00", tz);
    const high = instanteEnZona(addDays(dia, 1), "00:00", tz);
    const crudas = await fetchSesionesEnRango(supabase, low, high);

    const ahora = new Date();
    const estados = derivarEstadosDia(crudas, ahora);
    const sesiones = crudas.map((s, i) => toDTO(s, estados[i]));

    return { fecha: dia, sesiones, resumen: resumenDe(sesiones) };
  },
);

/** A week's sessions (gym tz), grouped Lun-Sáb, with per-day and whole-week
 *  occupancy summary inputs. `fechaIso` is any day within the target week.
 *  Ensures materialization for the week first (ADR-0010). */
export const getAgendaSemana = cache(
  async (fechaIso: string, client?: SupabaseServer): Promise<AgendaSemanaDTO> => {
    const supabase = client ?? (await createClient());
    await requireOperator(supabase);
    const { timezone: tz } = await getOperatorGym(supabase);

    const dia = parseDay(fechaIso);
    const lunes = inicioSemana(dia);
    await ensureSemanaMaterializada(supabase, lunes);

    const low = instanteEnZona(lunes, "00:00", tz);
    const high = instanteEnZona(addDays(lunes, 6), "00:00", tz);
    const crudas = await fetchSesionesEnRango(supabase, low, high);

    const ahora = new Date();
    const dias = semanaLunSab(lunes).map((fechaDia) => {
      const delDia = crudas.filter((s) => sameDay(fechaEnZona(s.startsAt.toISOString(), tz), fechaDia));
      const estados = derivarEstadosDia(delDia, ahora);
      const sesiones = delDia.map((s, i) => toDTO(s, estados[i]));
      return {
        fecha: fechaDia,
        sesiones,
        resumen: resumenDe(sesiones),
        ratioOcupacion: ratioAgregada(sesiones),
      };
    });

    const todasSesiones = dias.flatMap((d) => d.sesiones);
    return {
      lunes,
      dias,
      resumenSemana: { ...resumenDe(todasSesiones), ratioOcupacion: ratioAgregada(todasSesiones) },
    };
  },
);

// ── Mutations ─────────────────────────────────────────────────────────────

/** A discriminated result so the actions render one message surface — every
 *  Agenda mutation surfaces an RPC error this way rather than throwing through
 *  to the page (unlike e.g. actualizarPaquete's throw, which predates this
 *  convention; matches sesion.ts/registro.ts). */
export type AgendaResultado<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

async function ejecutar<T extends object>(fn: () => Promise<T>): Promise<AgendaResultado<T>> {
  try {
    return { ok: true, ...(await fn()) };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo completar la operación" };
  }
}

const FECHA_RE = /^\d{4}-\d{2}-\d{2}$/;
const coachIdsSchema = z.array(z.string().uuid()).default([]);

export const crearSesionSchema = z.object({
  classTypeId: z.string().uuid(),
  fecha: z.string().regex(FECHA_RE),
  hora: z.string().refine(horaValida, "Hora fuera de rango"),
  duracionMin: z.number().int().refine(duracionValida, "Duración inválida"),
  cupo: z.number().int().refine(cupoValido, "Cupo inválido"),
  coachIds: coachIdsSchema,
  esEspecial: z.boolean().default(false),
  nombreEspecial: z.string().trim().max(80).optional(),
  roomId: z.string().uuid().optional(),
});
export type CrearSesionInput = z.infer<typeof crearSesionSchema>;

/** Create a one-off class_session (crear clase). `esEspecial` with a blank/absent
 *  `nombreEspecial` defaults to "Especial" (PRD decision e). `client` injectable
 *  (ADR-0001); bounds validation (duración/cupo/hora) delegates to @gym/domain. */
export async function crearSesion(
  raw: unknown,
  client?: SupabaseServer,
): Promise<AgendaResultado<{ sesionId: string }>> {
  const parsed = crearSesionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const input = parsed.data;

  return ejecutar(async () => {
    const supabase = client ?? (await createClient());
    await requireOperator(supabase);
    const { timezone: tz } = await getOperatorGym(supabase);
    const startsAt = instanteEnZona(parseDay(input.fecha), input.hora, tz);
    const especialName = input.esEspecial ? input.nombreEspecial?.trim() || "Especial" : null;

    const { data, error } = await supabase.rpc("create_class_session", {
      p_class_type_id: input.classTypeId,
      p_starts_at: startsAt.toISOString(),
      p_duration_min: input.duracionMin,
      p_capacity: input.cupo,
      p_coach_ids: input.coachIds,
      p_is_special: input.esEspecial,
      ...(especialName !== null && { p_special_name: especialName }),
      ...(input.roomId !== undefined && { p_room_id: input.roomId }),
    });
    if (error || !data) throw new Error(error?.message || "No se pudo crear la clase");
    return { sesionId: data };
  });
}

export const crearHorarioRecurrenteSchema = z.object({
  classTypeId: z.string().uuid(),
  weekdays: z.array(z.number().int().min(0).max(5)).min(1),
  hora: z.string().refine(horaValida, "Hora fuera de rango"),
  duracionMin: z.number().int().refine(duracionValida, "Duración inválida"),
  cupo: z.number().int().refine(cupoValido, "Cupo inválido"),
  coachIds: coachIdsSchema,
  horizonWeeks: z.number().int().positive().optional(),
});
export type CrearHorarioRecurrenteInput = z.infer<typeof crearHorarioRecurrenteSchema>;

/** Create a recurring schedule ("Se repite"): one schedule_template per selected
 *  weekday + materializes the visible horizon, atomically (create_recurring_schedule).
 *  `client` injectable (ADR-0001). */
export async function crearHorarioRecurrente(
  raw: unknown,
  client?: SupabaseServer,
): Promise<AgendaResultado<{ templateIds: string[] }>> {
  const parsed = crearHorarioRecurrenteSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const input = parsed.data;

  return ejecutar(async () => {
    const supabase = client ?? (await createClient());
    await requireOperator(supabase);

    const { data, error } = await supabase.rpc("create_recurring_schedule", {
      p_class_type_id: input.classTypeId,
      p_weekdays: input.weekdays,
      p_start_time: input.hora,
      p_duration_min: input.duracionMin,
      p_capacity: input.cupo,
      p_coach_ids: input.coachIds,
      ...(input.horizonWeeks !== undefined && { p_horizon_weeks: input.horizonWeeks }),
    });
    if (error || !data) throw new Error(error?.message || "No se pudo crear el horario recurrente");
    return { templateIds: data };
  });
}

export const editarSesionSchema = z.object({
  sesionId: z.string().uuid(),
  classTypeId: z.string().uuid(),
  fecha: z.string().regex(FECHA_RE),
  hora: z.string().refine(horaValida, "Hora fuera de rango"),
  duracionMin: z.number().int().refine(duracionValida, "Duración inválida"),
  cupo: z.number().int().refine(cupoValido, "Cupo inválido"),
  coachIds: coachIdsSchema,
  esEspecial: z.boolean().default(false),
  nombreEspecial: z.string().trim().max(80).optional(),
  roomId: z.string().uuid().optional(),
});
export type EditarSesionInput = z.infer<typeof editarSesionSchema>;

/** Edit a single class_session (editar sesión) — NEVER fans out to the series
 *  (edit_class_session touches exactly one row; ADR-0010 §5.3). `client`
 *  injectable (ADR-0001). */
export async function editarSesion(raw: unknown, client?: SupabaseServer): Promise<AgendaResultado> {
  const parsed = editarSesionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const input = parsed.data;

  return ejecutar(async () => {
    const supabase = client ?? (await createClient());
    await requireOperator(supabase);
    const { timezone: tz } = await getOperatorGym(supabase);
    const startsAt = instanteEnZona(parseDay(input.fecha), input.hora, tz);
    const especialName = input.esEspecial ? input.nombreEspecial?.trim() || "Especial" : null;

    const { error } = await supabase.rpc("edit_class_session", {
      p_session_id: input.sesionId,
      p_class_type_id: input.classTypeId,
      p_starts_at: startsAt.toISOString(),
      p_duration_min: input.duracionMin,
      p_capacity: input.cupo,
      p_coach_ids: input.coachIds,
      p_is_special: input.esEspecial,
      ...(especialName !== null && { p_special_name: especialName }),
      ...(input.roomId !== undefined && { p_room_id: input.roomId }),
    });
    if (error) throw new Error(error.message || "No se pudo editar la sesión");
    return {};
  });
}

export const cancelarSesionSchema = z.object({ sesionId: z.string().uuid() });
export type CancelarSesionInput = z.infer<typeof cancelarSesionSchema>;

/** Cancel a single session (durable soft cancel; cancel_class_session).
 *  `client` injectable (ADR-0001). */
export async function cancelarSesion(raw: unknown, client?: SupabaseServer): Promise<AgendaResultado> {
  const parsed = cancelarSesionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };

  return ejecutar(async () => {
    const supabase = client ?? (await createClient());
    await requireOperator(supabase);
    const { error } = await supabase.rpc("cancel_class_session", { p_session_id: parsed.data.sesionId });
    if (error) throw new Error(error.message || "No se pudo cancelar la sesión");
    return {};
  });
}
