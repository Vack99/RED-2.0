import "server-only";

import { cache } from "react";
import { z } from "zod";

import { addDays, hoyEnZona, iniciales, toIsoDay } from "@gym/format";
import { createClient, type SupabaseServer } from "./supabase";

import { requireOperator } from "./_auth";
import { getOperatorGym } from "./gym";

/**
 * The attendance screen's day strip reaches this many days back from today (its own
 * `DIAS_TIRA_INICIAL`), each rendering a "has-marks" dot — so the INITIAL window must cover
 * at least this range or those dots regress to blank. The strip is a "use client"
 * module and cannot import from this `server-only` file, so the value is duplicated
 * there under the SAME name; the two MUST stay equal (an off-by-one here drops
 * marks off the far end of the strip) and asistencia-lockstep.test.ts guards it. This is
 * the same deliberate, commented duplication as @gym/format's difDias across the
 * format/domain boundary.
 */
export const DIAS_TIRA_INICIAL = 104;

/** First day of `d`'s calendar month (local fields). */
function primerDiaMes(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/**
 * Per-day PRESENCE over a window: { "YYYY-MM-DD": n } where n is the count of DISTINCT
 * clientes marked that day. This is what the day strip and month calendar dots need — a
 * day either has attendance or it doesn't (n > 0) — WITHOUT shipping the ids. The count
 * (not a bare boolean) rides along free: it is the same `distinct cliente_id` the id-map
 * already dedupes, and gives the dot a number a future badge can grow from.
 */
export type Presencia = Record<string, number>;

/**
 * Presence counts over a half-open `[desde, hasta)` gym-local date window via the
 * `marcadas_presencia` RPC (one round trip; RLS scopes the rows). Shared by the initial
 * window (dots) and the per-month lazy fetch.
 */
async function presenciaEnVentana(
  supabase: SupabaseServer,
  gymId: string,
  desde: Date,
  hasta: Date,
): Promise<Presencia> {
  const { data } = await supabase.rpc("marcadas_presencia", {
    p_gym_id: gymId,
    p_desde: toIsoDay(desde),
    p_hasta: toIsoDay(hasta),
  });
  return (data as Presencia) ?? {};
}

/**
 * ONE attendance row — a visit event, not a per-day flag (#89). The visit's CONTEXT is
 * `sessionId`: a class, or null for ACCESO LIBRE. Two classes in one day are simply two
 * rows; the desk screen groups by context and undoes per visit. Rows are keyed by
 * (clienteId, context) — at most one visit per pair per day — so the row `id` never
 * crosses the boundary.
 */
export interface Visita {
  clienteId: string;
  /** The class this visit belongs to, or null for ACCESO LIBRE. */
  sessionId: string | null;
  /** "HH:MM" check-in time, or null for a back-entered row with no time. */
  hora: string | null;
}

/**
 * The attendance screen's initial payload. Split by purpose:
 *
 * - `presencia` — per-day COUNTS across the whole initial window, for the strip/calendar
 *   dots. ~2 KB on the seed, versus the ~105 KB the id arrays for the same window cost.
 * - `visitasHoy` — TODAY's per-visit rows. Today's rows MUST be in the initial payload
 *   because the pase flow marks today's roster and must not wait on a fetch to do it; they
 *   carry the class context and the arrival hora the class-aware desk renders.
 *
 * Identity for any OTHER day is lazy and reads the SAME per-visit shape: the screen fetches
 * a picked past day's visits on demand (getVisitasDelDia), and a browsed month's dots on
 * demand (getMarcadasDeMes).
 */
export interface MarcadasInicial {
  presencia: Presencia;
  visitasHoy: Visita[];
}

/**
 * ONE day's attendance rows, one per visit, gym-scoped and soft-delete filtered — a DIRECT
 * table select rather than an RPC (the `getAsistenciasHoy` pattern): there is nothing to
 * aggregate here, the screen wants the rows themselves.
 *
 * Ordered by `hora` then `id` so the payload is stable across reloads (a back-entered row
 * has no hora; Postgres sorts those last, and `id` breaks the remaining ties).
 *
 * Best-effort: the error is not destructured, so any failure reads as "no attendance".
 */
async function visitasDelDia(
  supabase: SupabaseServer,
  gymId: string,
  fechaIso: string,
): Promise<Visita[]> {
  const { data } = await supabase
    .from("asistencias")
    .select("cliente_id, class_session_id, hora")
    .eq("gym_id", gymId)
    .eq("fecha", fechaIso)
    .is("deleted_at", null)
    .order("hora")
    .order("id");

  return (data ?? []).map((a) => ({
    clienteId: a.cliente_id,
    sessionId: a.class_session_id,
    hora: a.hora ? a.hora.slice(0, 5) : null,
  }));
}

/**
 * The attendance screen's initial load: presence dots for the whole window + today's visits.
 * Keyed by absolute gym-local date (ADR-0003).
 *
 * WINDOWED: the presence window runs from the first of the month containing
 * today − DIAS_TIRA_INICIAL through the first of next month — sized to cover the day strip's
 * full reach so every strip dot renders on first paint. Older months the calendar browses to
 * are lazy-fetched by `getMarcadasDeMes` (presence) and merged into client state.
 *
 * TWO reads, run CONCURRENTLY: presence counts over the window (RPC) + today's visit rows
 * (direct select). They overlap, so wall-clock ≈ one round trip, while the payload stays
 * ~2 KB of counts plus today's handful of rows. `toggle_pase` operates on today, whose rows
 * are therefore always in the initial payload.
 *
 * @returns { presencia, visitasHoy } · best-effort: each leg reads as empty on error
 * (errors are not destructured, so any failure reads as "no attendance").
 */
export const getMarcadas = cache(
  async (client?: SupabaseServer): Promise<MarcadasInicial> => {
    const supabase = client ?? (await createClient());
    const gym = await getOperatorGym(supabase); // gym-scoped read (spec §1.1)

    const hoy = hoyEnZona(gym.timezone); // gym-local "today" (ADR-0003)
    const desde = primerDiaMes(addDays(hoy, -DIAS_TIRA_INICIAL)); // covers the whole day strip
    const hasta = primerDiaMes(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1)); // first of next month (exclusive)

    const [presencia, visitasHoy] = await Promise.all([
      presenciaEnVentana(supabase, gym.id, desde, hasta),
      visitasDelDia(supabase, gym.id, toIsoDay(hoy)),
    ]);

    return { presencia, visitasHoy };
  },
);

/**
 * Who has BOOKED each of today's sessions — both `reservada` (booked, not yet marked) and
 * `asistida` (booked and already marked), because the desk's CON RESERVA group keys on the
 * BOOKING, not the check: a marked member must stay in the group so their row never moves
 * under the operator's thumb.
 *
 * One read, explicitly gym-scoped on top of RLS (the isolation predicate is a correlated
 * per-row subplan, so the redundant `.eq` is what keeps it index-driven).
 *
 * @returns { sessionId: clienteId[] } — no key for a session nobody booked ·
 *   best-effort: {} on error.
 */
export async function getReservasDelDia(
  sessionIds: string[],
  client?: SupabaseServer,
): Promise<Record<string, string[]>> {
  if (sessionIds.length === 0) return {};
  const supabase = client ?? (await createClient());
  const gym = await getOperatorGym(supabase); // re-auth + gym scope (spec §1.1)

  const { data } = await supabase
    .from("reservation")
    .select("class_session_id, member_id")
    .eq("gym_id", gym.id)
    .in("class_session_id", sessionIds)
    .in("status", ["reservada", "asistida"]);

  const porSesion: Record<string, string[]> = {};
  for (const r of data ?? []) (porSesion[r.class_session_id] ??= []).push(r.member_id);
  return porSesion;
}

/** A single month "YYYY-MM" — the lazy-load unit for presence dots. */
export const mesSchema = z.string().regex(/^\d{4}-\d{2}$/);

/**
 * PRESENCE counts for ONE calendar month ("YYYY-MM"), the lazy-load leg of getMarcadas'
 * windowing — the dots for a month the calendar browses outside the initial window. Same
 * gym scoping (getOperatorGym re-auths and scopes), addressed as the half-open month
 * `[firstOf(mes), firstOf(nextMes))`. Called by `marcadasDeMesAction`.
 *
 * @returns the date→count map for that month · best-effort: {} on RPC error.
 */
export async function getMarcadasDeMes(mes: string, client?: SupabaseServer): Promise<Presencia> {
  const [y, m] = mesSchema.parse(mes).split("-").map(Number);
  const supabase = client ?? (await createClient());
  const gym = await getOperatorGym(supabase); // re-auth + gym scope (spec §1.1)

  return presenciaEnVentana(supabase, gym.id, new Date(y, m - 1, 1), new Date(y, m, 1));
}

/** A single day "YYYY-MM-DD" — the identity lazy-load unit (a picked past day's roster). */
export const fechaSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * The VISITS of ONE day — the identity read a picked past day needs to render (and toggle)
 * its roster. Exactly the read the today-path uses, fecha-parameterized: past days and today
 * run ONE state model (#89), so a member marked in a class renders as a class visit on a past
 * day too, and the day's 2-arg toggle keeps owning the ACCESO LIBRE row alone — never
 * "checked" off a class row it cannot undo. Today never routes here (its visits ship in the
 * initial payload). Called by `visitasDelDiaAction`.
 *
 * @returns that day's Visita[] (empty when none) · best-effort: [] on read error.
 */
export async function getVisitasDelDia(fecha: string, client?: SupabaseServer): Promise<Visita[]> {
  const dia = fechaSchema.parse(fecha);
  const supabase = client ?? (await createClient());
  const gym = await getOperatorGym(supabase); // re-auth + gym scope (spec §1.1)

  return visitasDelDia(supabase, gym.id, dia);
}

export const togglePaseSchema = z.object({
  clienteId: z.string().min(1),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  /** The class the visit belongs to. Omitted = ACCESO LIBRE, the class-less visit kind
   *  (#89) — NOT "unknown": the RPC stamps `origen` from this argument's presence. */
  sessionId: z.string().uuid().optional(),
});

export interface TogglePaseResult {
  present: boolean;
  hora: string | null;
  /**
   * The class the visit LANDED in, or null for an ACCESO LIBRE visit. A 2-arg tap on a
   * member holding a booking inside its arrival window is attributed to that class by the
   * RPC (ruling 2026-07-29), so this is not always the context the caller sent: the desk
   * reconciles the mark into THIS session, and the ficha leaves its libre checkbox alone.
   */
  sessionId: string | null;
  /** The cliente's balance AFTER the write; null = ilimitado. The desk repaints the
   *  tapped row's clases label from it, so a rush no longer shows a page-load count. */
  clasesRestantes: number | null;
}

/**
 * The action/DAL result the pase surfaces switch on. An RPC refusal travels as a
 * typed RETURN VALUE, never a throw: a thrown Server Action error has its message
 * MASKED in production Next.js builds (reconstructed client-side as a generic
 * English blob), so 'Paquete vencido' / the C15 session-managed guard would never
 * reach the toast. Same convention as vender's CrearVentaResult (`ok` discriminant).
 */
export type TogglePaseOutcome =
  | ({ ok: true } & TogglePaseResult)
  | { ok: false; message: string };

/**
 * Toggle a client's attendance for one (absolute) day, in one CONTEXT: a class
 * (`sessionId`) or ACCESO LIBRE (omitted). Marking present inserts a visit row and
 * consumes a class — Ilimitado untouched, an active booking not re-charged, and a
 * mark within the cooldown of a visit of the OTHER kind recorded with `consumio=false`
 * instead of charging twice (#89). Unmarking soft-deletes that context's active row and
 * restores a class ONLY if one was actually consumed. Back-dated days are allowed (no time).
 *
 * With `sessionId` the RPC delegates to `pasar_lista_sesion`: a desk tap inside a class
 * and an Agenda roster tap are the SAME act — one write path, one semantics, reservation
 * flip included. WITHOUT one, the RPC still ATTRIBUTES the tap to a booking whose arrival
 * window contains now (ruling 2026-07-29) and returns the class it landed in as
 * `sessionId`. Attribution is arm-only: it never undoes a mark — an already-marked
 * booking refuses with 'Ya marcada en la clase de HH:MM' instead.
 *
 * The read-then-write toggle is one atomic transaction via the `toggle_pase`
 * RPC (ADR-0005): it makes the on/off decision, the guarded ±1 decrement, and
 * stamps the gym-local check-in time server-side. RLS scopes every row to
 * the operator (SECURITY INVOKER).
 *
 * An RPC failure returns `{ ok: false, message }` carrying the RPC's OWN raise —
 * every toggle_pase refusal is a deliberate operator-facing Spanish message
 * ('Paquete vencido'; C9) — so the UI can toast the reason. Only unexpected failures
 * (invalid input, no auth) still throw.
 */
export async function togglePase(
  raw: unknown,
  client?: SupabaseServer,
): Promise<TogglePaseOutcome> {
  const input = togglePaseSchema.parse(raw);
  const supabase = client ?? (await createClient());

  // Presence check only — the RPC stamps the operator server-side (SECURITY
  // INVOKER), so the sub is discarded here (matches prior behavior).
  await requireOperator(supabase);

  const { data, error } = await supabase
    .rpc("toggle_pase", {
      p_cliente_id: input.clienteId,
      p_fecha: input.fecha,
      // Spread, not `p_session_id: undefined` — an absent argument is what selects the
      // function's own NULL default (the ACCESO LIBRE context).
      ...(input.sessionId !== undefined && { p_session_id: input.sessionId }),
    })
    .single();
  if (error) return { ok: false, message: error.message || "No se pudo registrar la asistencia" };
  if (!data) return { ok: false, message: "No se pudo registrar la asistencia" };

  return {
    ok: true,
    present: data.present,
    hora: data.hora,
    sessionId: data.session_id,
    clasesRestantes: data.clases_restantes,
  };
}

export interface AsistenciaHoy {
  cliente_id: string;
  nombre: string;
  inicial: string;
  paquete: string;
  /** "HH:MM" check-in time, or "" for a back-entered row with no time. */
  hora: string;
}

/**
 * Today's asistencia rows joined to clientes, ordered by time (most recent
 * first) — drives the inicio "Últimas asistencias" list. RLS-scoped read;
 * returns DTOs only (no raw rows cross the boundary, ADR-0001).
 *
 * Session pases (rows `pasar_lista_sesion` writes, with `class_session_id` set)
 * appear here — this is the feed of who checked in today, whichever seam wrote
 * it. That is true of EVERY attendance read: getMarcadas ships session rows too,
 * as visits carrying their class context (#89).
 *
 * @returns the DTO list (empty when no rows) · throws on DB error.
 */
export async function getAsistenciasHoy(client?: SupabaseServer): Promise<AsistenciaHoy[]> {
  const supabase = client ?? (await createClient());
  const gym = await getOperatorGym(supabase);
  const hoyIso = toIsoDay(hoyEnZona(gym.timezone));

  const { data: asis, error } = await supabase
    .from("asistencias")
    .select("cliente_id, hora")
    .eq("gym_id", gym.id)
    .eq("fecha", hoyIso)
    .is("deleted_at", null)
    .order("hora", { ascending: false });
  if (error) throw error;

  const rows = asis ?? [];
  if (rows.length === 0) return [];

  const ids = [...new Set(rows.map((a) => a.cliente_id))];
  const { data: clientes, error: cErr } = await supabase
    .from("clientes")
    .select("id, nombre, paquete_nombre")
    .in("id", ids);
  if (cErr) throw cErr;

  const byId = new Map(
    (clientes ?? []).map((c) => [
      c.id,
      { nombre: c.nombre, paquete: c.paquete_nombre ?? "Sin paquete" },
    ]),
  );

  return rows.map((a) => {
    const c = byId.get(a.cliente_id);
    const nombre = c?.nombre ?? "—";
    return {
      cliente_id: a.cliente_id,
      nombre,
      inicial: iniciales(nombre),
      paquete: c?.paquete ?? "Sin paquete",
      hora: (a.hora ?? "").slice(0, 5),
    };
  });
}
