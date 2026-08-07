import "server-only";

import { cache } from "react";
import { z } from "zod";

import {
  cupoValido,
  derivarEstadosDia,
  disponibles,
  duracionValida,
  esNoAsistio,
  horaValida,
  muestraEspecial,
  ratioOcupacion,
} from "@gym/domain/rules";
import type { EstadoSesion } from "@gym/domain/types";
import { addDays, fechaEnZona, hoyEnZona, iniciales, inicioSemana, instanteEnZona, parseDay, sameDay, semanaLunSab, toIsoDay } from "@gym/format";

import { requireOperator } from "./_auth";
import { getClientesParaPase, type PaseClienteDTO } from "./clientes";
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

/**
 * The RULE behind a generated class, as the rule stands RIGHT NOW (#243) — never the clicked
 * session's own values, which can legitimately have drifted off it: `update_recurring_schedule`
 * leaves a class whose recomputed instant would land in the past at the time it already had,
 * still attached to the template. A wide save REWRITES the template, so the editor has to seed
 * from this; seeding it from an off-grid session would silently revert the whole series to that
 * session's stale hora/cupo/tipo/coaches. `null` for a one-off, which has no rule to read.
 */
export interface PlantillaDTO {
  tipo: string;
  /** The rule's `start_time` as a gym-local "HH:MM" wall clock (the column is already local). */
  hora: string;
  duracionMin: number;
  capacidad: number;
  coachIds: string[];
  /** Every ACTIVE weekday (0=Lun..5=Sáb) sharing this template's `group_id` — the siblings one
   *  "repeat on N weekdays" create left behind — sorted, own weekday always included even if this
   *  template itself has since been retired solo (a per-weekday edit/retire can diverge a group). */
  groupDias: number[];
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
  /** The generating `schedule_template.id`, or `null` for a one-off session (#243 slice 4) —
   *  today the client cannot tell the two apart. Non-null is what makes a session eligible for
   *  the series edit/retire verbs; the sheet reads this, not any local heuristic. */
  templateId: string | null;
  /** That template's CURRENT values — the wide-scope editor's seed. Non-null exactly when
   *  `templateId` is. */
  plantilla: PlantillaDTO | null;
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
  templateId: string | null;
  plantilla: PlantillaDTO | null;
}

/** Fetch non-cancelled sessions in `[low, high)` (an absolute UTC instant range),
 *  joined to class_type + coaches — three plain reads assembled in JS (no
 *  embedded PostgREST select), matching the rest of the DAL (e.g. getAsistenciasHoy).
 *  Ordered by startsAt ascending — the order `derivarEstadosDia` requires.
 *
 *  The ONE embed here is the generating `schedule_template` (#243), and it is deliberate: it
 *  rides the `template_id` FK that already exists, so the rule's own values cost no extra round
 *  trip on the hot agenda read — and the wide-scope editor cannot seed correctly without them. */
async function fetchSesionesEnRango(
  supabase: SupabaseServer,
  low: Date,
  high: Date,
): Promise<SesionRaw[]> {
  const { data: sesiones, error } = await supabase
    .from("class_session")
    // One string LITERAL, deliberately: supabase-js parses this at the type level, and a
    // concatenation collapses every column to GenericStringError.
    .select(
      "id, class_type_id, starts_at, duration_min, capacity, is_special, special_name, room_id, template_id, schedule_template(class_type_id, start_time, duration_min, capacity, group_id, weekday, schedule_template_coach(coach_id))",
    )
    .is("cancelled_at", null)
    .gte("starts_at", low.toISOString())
    .lt("starts_at", high.toISOString())
    .order("starts_at");
  if (error) throw error;

  const rows = sesiones ?? [];
  if (rows.length === 0) return [];

  // The TEMPLATE's class_type rides along: a session that drifted off its rule can sit on a
  // different tipo than the rule now names, and the wide-scope seed shows the rule's.
  const tipoIds = [
    ...new Set(
      rows.flatMap((r) => (r.schedule_template ? [r.class_type_id, r.schedule_template.class_type_id] : [r.class_type_id])),
    ),
  ];
  const sessionIds = rows.map((r) => r.id);

  // Every group_id riding along on the page's templates — the extra read below (siblings'
  // weekdays for the "todos los días" seed) is batched over THESE, one query for the whole
  // page, never per-card.
  const groupIds = [
    ...new Set(rows.flatMap((r) => (r.schedule_template ? [r.schedule_template.group_id] : []))),
  ];

  // class_type, class_session_coach, the occupancy count, and the template group's sibling
  // weekdays all only need tipoIds/sessionIds/groupIds (known since the class_session select
  // above) — batched here instead of sequencing contarActivos after the conditional coach
  // query, so it no longer adds a 4th sequential round trip for no reason (perf; same pattern
  // as agenda-miembro.ts).
  const [tiposRes, joinsRes, activosBySession, gruposRes] = await Promise.all([
    supabase.from("class_type").select("id, name").in("id", tipoIds),
    supabase.from("class_session_coach").select("session_id, coach_id").in("session_id", sessionIds),
    contarActivos(supabase, sessionIds),
    groupIds.length
      ? supabase.from("schedule_template").select("group_id, weekday").in("group_id", groupIds).eq("is_active", true)
      : Promise.resolve({ data: [] as { group_id: string; weekday: number }[], error: null }),
  ]);
  if (tiposRes.error) throw tiposRes.error;
  if (joinsRes.error) throw joinsRes.error;
  if (gruposRes.error) throw gruposRes.error;

  const diasPorGrupo = new Map<string, Set<number>>();
  for (const g of gruposRes.data ?? []) {
    const dias = diasPorGrupo.get(g.group_id) ?? new Set<number>();
    dias.add(g.weekday);
    diasPorGrupo.set(g.group_id, dias);
  }

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
    templateId: r.template_id,
    plantilla: r.schedule_template
      ? {
          tipo: tipoById.get(r.schedule_template.class_type_id) ?? "—",
          hora: r.schedule_template.start_time.slice(0, 5),
          duracionMin: r.schedule_template.duration_min,
          capacidad: r.schedule_template.capacity,
          coachIds: r.schedule_template.schedule_template_coach.map((c) => c.coach_id),
          groupDias: [
            ...new Set([...(diasPorGrupo.get(r.schedule_template.group_id) ?? []), r.schedule_template.weekday]),
          ].sort((a, b) => a - b),
        }
      : null,
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
    templateId: s.templateId,
    plantilla: s.plantilla,
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

/** How many weeks ahead materialization writes — and therefore the last week that can hold real
 *  classes. Exported because the Agenda page needs the same number to tell a week PAST the horizon
 *  (nothing is generated there yet) from a genuinely empty one (#243): the two look identical and
 *  only one of them should invite a create. */
export const HORIZONTE_SEMANAS = 26;

/** #244 guard 3 (weakness 9): staff can ask the Agenda to VIEW any week via `?d=` — including a
 *  past week (the history-browsing flow is legitimate) or one decades out — but materialization
 *  WRITES permanent rows (ADR-0010: cancel is the only undo, there is no delete). So the write is
 *  clamped to [this week's Monday, +26 weeks] in the gym's own tz, independent of what week the
 *  caller asked to view. #243 slice 1 tightened this from +1 year: it is the only real bound on
 *  a series retire's blast radius (halves the worst case from 2,080 to 1,040 `clientes` row locks
 *  — browsing materializes weeks on demand, so a deep browse digs a real hole). Out of range: this
 *  returns without calling the RPC at all, and the read below still runs — an unmaterialized week
 *  just comes back with whatever sessions already exist (none, for a week nobody ever staffed; the
 *  true historical rows, for one that was). */
async function ensureSemanaMaterializada(supabase: SupabaseServer, lunes: Date, tz: string): Promise<void> {
  const lunesActual = inicioSemana(hoyEnZona(tz));
  const horizonte = addDays(lunesActual, HORIZONTE_SEMANAS * 7);
  if (lunes.getTime() < lunesActual.getTime() || lunes.getTime() > horizonte.getTime()) return;
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
    await ensureSemanaMaterializada(supabase, lunes, tz);

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
    await ensureSemanaMaterializada(supabase, lunes, tz);

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

// ── Roster (slice #60 — reservation-aware Pasar lista) ──────────────────────

/** One booked member on a session's roster. `present` is the reservation's `asistida`
 *  state (the pase de lista mark); `isWalkIn` flags an operator-created door reservation. */
export interface RosterMemberDTO {
  clienteId: string;
  nombre: string;
  inicial: string;
  paquete: string;
  present: boolean;
  isWalkIn: boolean;
  /** Booked and never marked, with the arrival window already closed — "no asistió".
   *  DERIVED at read (ruling 2026-07-29), never a stored state: marking the row
   *  supersedes it on the next read, so there is nothing to un-stamp. */
  noAsistio: boolean;
}

/** A session's roster plus the walk-in picker candidates. `roster` is the active
 *  reservations (`reservada | asistida`) — booked members and already-marked walk-ins;
 *  `candidates` is every other gym cliente (not on the roster), the pool Pasar lista can
 *  add as a walk-in. */
export interface SesionRosterDTO {
  roster: RosterMemberDTO[];
  candidates: PaseClienteDTO[];
}

/** The booked roster for one session (staff RLS-scoped), joined to clientes, plus the
 *  walk-in candidate pool — four plain reads assembled in JS (no embedded PostgREST
 *  select), matching the rest of the DAL. Roster ordered by name.
 *
 *  The session's own row rides along so each roster line can DERIVE `noAsistio` from the
 *  arrival window (ruling 2026-07-29). Best-effort: its error is not destructured, so a
 *  failed session read costs the NO ASISTIÓ caption, never the roster. */
export const getSesionRoster = cache(
  async (sessionId: string, client?: SupabaseServer): Promise<SesionRosterDTO> => {
    const supabase = client ?? (await createClient());
    await requireOperator(supabase);

    const [{ data: reservas, error }, { data: sesion }, candidatosTodos] = await Promise.all([
      supabase
        .from("reservation")
        .select("member_id, status, is_walk_in")
        .eq("class_session_id", sessionId)
        .in("status", ["reservada", "asistida"]),
      supabase
        .from("class_session")
        .select("starts_at, duration_min")
        .eq("id", sessionId)
        .maybeSingle(),
      getClientesParaPase(supabase),
    ]);
    if (error) throw error;

    const activas = reservas ?? [];
    const byId = new Map(candidatosTodos.map((c) => [c.id, c]));
    const ahora = new Date();

    const roster: RosterMemberDTO[] = activas
      .map((r) => {
        const c = byId.get(r.member_id);
        return {
          clienteId: r.member_id,
          nombre: c?.nombre ?? "—",
          inicial: c?.inicial ?? iniciales(c?.nombre ?? "—"),
          paquete: c?.paquete ?? "Sin paquete",
          present: r.status === "asistida",
          isWalkIn: r.is_walk_in,
          noAsistio: sesion
            ? esNoAsistio(r.status, new Date(sesion.starts_at), sesion.duration_min, ahora)
            : false,
        };
      })
      .sort((a, b) => a.nombre.localeCompare(b.nombre));

    const enRoster = new Set(activas.map((r) => r.member_id));
    const candidates = candidatosTodos.filter((c) => !enRoster.has(c.id));

    return { roster, candidates };
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

export const actualizarHorarioRecurrenteSchema = z.object({
  templateId: z.string().uuid(),
  classTypeId: z.string().uuid(),
  weekday: z.number().int().min(0).max(5).optional(),
  hora: z.string().refine(horaValida, "Hora fuera de rango"),
  duracionMin: z.number().int().refine(duracionValida, "Duración inválida"),
  cupo: z.number().int().refine(cupoValido, "Cupo inválido"),
  coachIds: z.array(z.string().uuid()).optional(),
  /** "Todos los días" — fan the edit out to every template sharing this one's group_id
   *  (the siblings one "repeat on N weekdays" create left behind), not just this weekday. */
  todosLosDias: z.boolean().optional(),
});
export type ActualizarHorarioRecurrenteInput = z.infer<typeof actualizarHorarioRecurrenteSchema>;

/** Update a recurring schedule going forward ("esta y las siguientes"; #243): UPDATEs
 *  every future, uncancelled class_session under the template in place —
 *  update_recurring_schedule recomputes each instant, moving every booking with its
 *  class for free (the FK points at the row, not the time); nothing is charged or
 *  refunded. `coachIds` is sent only when the caller actually supplies it — omitted
 *  (undefined) means "leave the coach set alone", because the RPC's `p_coach_ids`
 *  defaults to null and only touches `schedule_template_coach` when non-null (an
 *  unconditional replace would stamp one clicked session's substitute coach onto the
 *  whole series). `client` injectable (ADR-0001).
 *
 *  The RPC answers with BOTH halves of what it did: `moved` and `kept` — the future
 *  classes whose recomputed instant would have landed in the past, which the guard
 *  leaves at the time they already had (structurally 0 or 1: only the current week's
 *  class can recompute backwards). They stay in the series; they just did not move.
 *  Surfaced rather than swallowed because the receipt has to name them (#243 §4). */
export async function actualizarHorarioRecurrente(
  raw: unknown,
  client?: SupabaseServer,
): Promise<AgendaResultado<{ clasesMovidas: number; clasesSinMover: number }>> {
  const parsed = actualizarHorarioRecurrenteSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const input = parsed.data;

  return ejecutar(async () => {
    const supabase = client ?? (await createClient());
    await requireOperator(supabase);

    const { data, error } = await supabase.rpc("update_recurring_schedule", {
      p_template_id: input.templateId,
      p_class_type_id: input.classTypeId,
      p_start_time: input.hora,
      p_duration_min: input.duracionMin,
      p_capacity: input.cupo,
      ...(input.weekday !== undefined && { p_weekday: input.weekday }),
      ...(input.coachIds !== undefined && { p_coach_ids: input.coachIds }),
      ...(input.todosLosDias && { p_all_days: true }),
    });
    // `!data` is safe HERE (unlike the bare-int retire below): the RPC's OUT params come
    // back as one object, so only a genuine failure is falsy — `{ moved: 0, kept: 0 }` is
    // a legitimate success (every materialized week for this template is already past).
    if (error || !data) throw new Error(error?.message || "No se pudo actualizar el horario recurrente");
    return { clasesMovidas: data.moved, clasesSinMover: data.kept };
  });
}

export const retirarHorarioRecurrenteSchema = z.object({
  templateId: z.string().uuid(),
  /** "Todos los días" — retire every template sharing this one's group_id, not just this weekday. */
  todosLosDias: z.boolean().optional(),
});
export type RetirarHorarioRecurrenteInput = z.infer<typeof retirarHorarioRecurrenteSchema>;

/** Retire a recurring schedule ("terminar el horario"; #243): flips
 *  `schedule_template.is_active = false` and cancels every future, uncancelled
 *  class_session under the template through the same `cancel_class_session` the
 *  single-class cancel already uses — releasing each hold through the one
 *  implementation that exists (never a copy of the refund body). `client`
 *  injectable (ADR-0001). */
export async function retirarHorarioRecurrente(
  raw: unknown,
  client?: SupabaseServer,
): Promise<AgendaResultado<{ clasesCanceladas: number }>> {
  const parsed = retirarHorarioRecurrenteSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const input = parsed.data;

  return ejecutar(async () => {
    const supabase = client ?? (await createClient());
    await requireOperator(supabase);

    const { data, error } = await supabase.rpc("retire_recurring_schedule", {
      p_template_id: input.templateId,
      ...(input.todosLosDias && { p_all_days: true }),
    });
    // NOT `!data`: 0 future classes cancelled is a legitimate success (see above).
    if (error || data === null) throw new Error(error?.message || "No se pudo retirar el horario recurrente");
    return { clasesCanceladas: data };
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

export const pasarListaSesionSchema = z.object({
  sessionId: z.string().uuid(),
  clienteId: z.string().uuid(),
});
export type PasarListaSesionInput = z.infer<typeof pasarListaSesionSchema>;

/** Reservation-aware Pasar lista (slice #60; ADR-0010 §4/§5): toggles one member's
 *  attendance for one session through the atomic `pasar_lista_sesion` RPC. A booked
 *  member flips reservada→asistida WITHOUT re-consuming (already consumed at booking);
 *  a walk-in gets an is_walk_in reservation + consumes exactly as the front desk does;
 *  untoggle reverses each symmetrically. The RPC owns all balance math (ADR-0005 seam);
 *  this seam just validates, re-auths, and returns the new present state.
 *
 *  `sessionId` / `clasesRestantes` are the shape `toggle_pase` and `pasar_lista_sesion`
 *  now SHARE by construction — the desk's delegation returns one function's rows through
 *  the other, so their arities cannot diverge. Surfaced here too so the two seams read
 *  alike; the Agenda screen reloads the roster instead of using them. */
export async function pasarListaSesion(
  raw: unknown,
  client?: SupabaseServer,
): Promise<
  AgendaResultado<{
    present: boolean;
    hora: string | null;
    sessionId: string | null;
    clasesRestantes: number | null;
    /** The settlement outcome (#233/#246): 'descontada' | 'gratis' | 'reserva' | null
     *  (every toggle-OFF/un-mark). Mirrors togglePase's TogglePaseResult field. */
    resultado: string | null;
  }>
> {
  const parsed = pasarListaSesionSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const input = parsed.data;

  return ejecutar(async () => {
    const supabase = client ?? (await createClient());
    await requireOperator(supabase);
    const { data, error } = await supabase
      .rpc("pasar_lista_sesion", { p_session_id: input.sessionId, p_cliente_id: input.clienteId })
      .single();
    if (error || !data) throw new Error(error?.message || "No se pudo pasar lista");
    return {
      present: data.present,
      hora: data.hora,
      sessionId: data.session_id,
      clasesRestantes: data.clases_restantes,
      resultado: data.resultado,
    };
  });
}

export const reservaClienteSchema = z.object({
  sessionId: z.string().uuid(),
  clienteId: z.string().uuid(),
});
export type ReservaClienteInput = z.infer<typeof reservaClienteSchema>;

/** Book a member into a future session ON THEIR BEHALF — the operator path of
 *  `reservar_clase` (#237: a non-null `p_cliente_id` selects it and is staff-gated inside
 *  the definer body). The record is a member's own booking in every respect: it consumes a
 *  class now, counts toward cupo, and shows in the member's app (#235). The RPC owns every
 *  guard and all the balance math (ADR-0005 seam) — this seam validates, re-auths, and
 *  surfaces the Spanish raise verbatim. The Agenda reloads the roster, so no row is mapped
 *  back. `client` injectable (ADR-0001). */
export async function reservarClaseCliente(raw: unknown, client?: SupabaseServer): Promise<AgendaResultado> {
  const parsed = reservaClienteSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const input = parsed.data;

  return ejecutar(async () => {
    const supabase = client ?? (await createClient());
    await requireOperator(supabase);
    const { error } = await supabase.rpc("reservar_clase", {
      p_session_id: input.sessionId,
      p_cliente_id: input.clienteId,
    });
    if (error) throw new Error(error.message || "No se pudo reservar");
    return {};
  });
}

/** Undo an operator-made reserva — the operator path of `cancelar_reserva` (#237), and NOT
 *  optional: charging is at booking, so a mis-tap costs the wrong member a class that only
 *  this refunds (#235). The RPC refuses once the class has started, and refunds exactly what
 *  the booking spent. Twin of reservarClaseCliente in every other respect. */
export async function cancelarReservaCliente(raw: unknown, client?: SupabaseServer): Promise<AgendaResultado> {
  const parsed = reservaClienteSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  const input = parsed.data;

  return ejecutar(async () => {
    const supabase = client ?? (await createClient());
    await requireOperator(supabase);
    const { error } = await supabase.rpc("cancelar_reserva", {
      p_session_id: input.sessionId,
      p_cliente_id: input.clienteId,
    });
    if (error) throw new Error(error.message || "No se pudo cancelar la reserva");
    return {};
  });
}
