import "server-only";

import { cache } from "react";
import { z } from "zod";

import { addDays, hoyEnZona, iniciales, toIsoDay } from "@gym/format";
import { createClient, type SupabaseServer } from "./supabase";

import { requireOperator } from "./_auth";
import { getOperatorGym } from "./gym";

/**
 * The attendance screen's day strip reaches this many days back from today (its
 * `DAYS_BACK`), each rendering a "has-marks" dot — so the INITIAL window must cover
 * at least this range or those dots regress to blank. The strip is a "use client"
 * module and cannot import from this `server-only` file, so the value is duplicated
 * there with a cross-reference; the two MUST stay equal (an off-by-one here drops
 * marks off the far end of the strip). This is the same deliberate, commented
 * duplication as @gym/format's difDias across the format/domain boundary.
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
 * The active-attendance IDS map over a half-open `[desde, hasta)` gym-local date window
 * via the `marcadas_por_gym` RPC (one round trip; RLS scopes the rows). This is the
 * IDENTITY read — which clientes attended — needed only for the day the operator is
 * looking at (today on first paint, a picked day thereafter), never the whole window.
 *
 * ALL surfaces (ruling C15): reads front-desk AND session-linked rows. One attended class
 * = one consumed class regardless of surface, so a member marked via the Agenda / app
 * booking (a `class_session_id`-linked row) shows CHECKED here too — otherwise the operator
 * taps them present and `toggle_pase` writes a SECOND consuming row. `toggle_pase` refuses a
 * session-marked mistap ('Asistencia de clase ya registrada') and re-marks a still-active
 * booking with no re-consume, so display and toggle agree. SECURITY INVOKER — the caller's
 * own role runs the function, so the `asistencias` RLS policy enforces gym scoping.
 */
async function marcadasEnVentana(
  supabase: SupabaseServer,
  gymId: string,
  desde: Date,
  hasta: Date,
): Promise<Record<string, string[]>> {
  const { data } = await supabase.rpc("marcadas_por_gym", {
    p_gym_id: gymId,
    p_desde: toIsoDay(desde),
    p_hasta: toIsoDay(hasta),
  });
  return (data as Record<string, string[]>) ?? {};
}

/**
 * The attendance screen's initial payload (perf wave 5). Split by purpose:
 *
 * - `presencia` — per-day COUNTS across the whole initial window, for the strip/calendar
 *   dots. ~2 KB on the seed, versus the ~105 KB the id arrays for the same window cost.
 * - `marcadasDelDia` — the full ids for TODAY only, keyed by today's iso so the screen can
 *   merge it straight into its per-day ids cache. Today's ids MUST be in the initial payload
 *   because the pase flow toggles today's roster and must not wait on a fetch to do it.
 *
 * Identity for any OTHER day is lazy: the screen fetches a picked past day's ids on demand
 * (getMarcadasDelDia), and a browsed month's dots on demand (getMarcadasDeMes).
 */
export interface MarcadasInicial {
  presencia: Presencia;
  marcadasDelDia: Record<string, string[]>;
}

/**
 * The attendance screen's initial load: presence dots for the whole window + today's ids.
 * Keyed by absolute gym-local date (ADR-0003).
 *
 * WINDOWED (perf wave 4): the presence window runs from the first of the month containing
 * today − DIAS_TIRA_INICIAL through the first of next month — sized to cover the day strip's
 * full reach so every strip dot renders on first paint. Older months the calendar browses to
 * are lazy-fetched by `getMarcadasDeMes` (presence) and merged into client state.
 *
 * TWO RPCs, run CONCURRENTLY (perf wave 5): presence counts over the window + the id map for
 * TODAY's 1-day window. They overlap, so wall-clock ≈ one round trip, while the payload drops
 * from ~105 KB of id arrays to ~2 KB of counts plus today's ~1 KB of ids. `toggle_pase`
 * operates on today, whose ids are therefore always in the initial payload.
 *
 * @returns { presencia, marcadasDelDia } · best-effort: each leg reads as empty on RPC error
 * (errors are not destructured, so any failure reads as "no attendance").
 */
export const getMarcadas = cache(
  async (client?: SupabaseServer): Promise<MarcadasInicial> => {
    const supabase = client ?? (await createClient());
    const gym = await getOperatorGym(supabase); // gym-scoped read (spec §1.1)

    const hoy = hoyEnZona(gym.timezone); // gym-local "today" (ADR-0003)
    const desde = primerDiaMes(addDays(hoy, -DIAS_TIRA_INICIAL)); // covers the whole day strip
    const hasta = primerDiaMes(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1)); // first of next month (exclusive)
    const manana = addDays(hoy, 1);

    const [presencia, idsHoy] = await Promise.all([
      presenciaEnVentana(supabase, gym.id, desde, hasta),
      marcadasEnVentana(supabase, gym.id, hoy, manana), // today's 1-day [hoy, mañana) window
    ]);

    const hoyIso = toIsoDay(hoy);
    return { presencia, marcadasDelDia: { [hoyIso]: idsHoy[hoyIso] ?? [] } };
  },
);

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
 * The IDS of clientes marked present on ONE day — the identity read a picked past day needs
 * to render (and toggle) its roster. Reuses the `marcadas_por_gym` id-map RPC over that day's
 * 1-day `[fecha, fecha+1)` window (no overload — same signature as today's fetch), and returns
 * just that day's array. Today never routes here (its ids ship in the initial payload).
 * Called by `marcadasDelDiaAction`.
 *
 * @returns the clienteId[] for `fecha` (empty when none) · best-effort: [] on RPC error.
 */
export async function getMarcadasDelDia(fecha: string, client?: SupabaseServer): Promise<string[]> {
  const dia = fechaSchema.parse(fecha);
  const [y, m, d] = dia.split("-").map(Number);
  const supabase = client ?? (await createClient());
  const gym = await getOperatorGym(supabase); // re-auth + gym scope (spec §1.1)

  const map = await marcadasEnVentana(
    supabase,
    gym.id,
    new Date(y, m - 1, d),
    new Date(y, m - 1, d + 1), // Date normalizes month/year rollover
  );
  return map[dia] ?? [];
}

export const togglePaseSchema = z.object({
  clienteId: z.string().min(1),
  fecha: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export interface TogglePaseResult {
  present: boolean;
  hora: string | null;
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
 * Toggle a client's attendance for a given (absolute) day. Marking present
 * inserts a row and consumes a class (Ilimitado untouched; ruling C15 — one visit
 * consumes ONCE across surfaces: a member already session-marked that day is
 * refused, never double-consumed); unmarking soft-deletes the active row and
 * restores a class ONLY if one was actually consumed. Back-dated days are allowed
 * (no time).
 *
 * The read-then-write toggle is one atomic transaction via the `toggle_pase`
 * RPC (ADR-0005): it makes the on/off decision, the guarded ±1 decrement, and
 * stamps the Chihuahua-local check-in time server-side. RLS scopes every row to
 * the operator (SECURITY INVOKER).
 *
 * An RPC failure returns `{ ok: false, message }` carrying the RPC's OWN raise —
 * every toggle_pase refusal is a deliberate operator-facing Spanish message
 * ('Paquete vencido'; 'Asistencia de clase ya registrada — gestiónala en la
 * clase'; C15/C9) — so the UI can toast the reason. Only unexpected failures
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
    .rpc("toggle_pase", { p_cliente_id: input.clienteId, p_fecha: input.fecha })
    .single();
  if (error) return { ok: false, message: error.message || "No se pudo registrar la asistencia" };
  if (!data) return { ok: false, message: "No se pudo registrar la asistencia" };

  return { ok: true, present: data.present, hora: data.hora };
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
 * it. Since ruling C15 that is true of EVERY attendance read: getMarcadas shows
 * session rows too (toggle_pase refuses the double-consume server-side).
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
