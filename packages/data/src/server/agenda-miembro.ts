import "server-only";

import { cache } from "react";

import { derivarEstadosDia, diasRestantes, disponibles, ratioOcupacion } from "@gym/domain/rules";
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
  pesos,
  sameDay,
  semanaLunSab,
  toIsoDay,
} from "@gym/format";

import { derivarMembresia, type MembresiaDerivada } from "./derive";
import { getPlanesPublicos } from "./marketing";

export type { MembresiaDerivada } from "./derive";
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
  /** Absolute UTC bounds — the confirmed-sheet ".ics" calendar action (slice #57). */
  inicioIso: string;
  finIso: string;
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
  /** True when this session's class type is the member's favorite (the "Tu favorita" tag). */
  favorita: boolean;
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
  /** Plan's vigencia has lapsed (`vence` before today, gym tz). Mirrors the reservar_clase
   *  server gate, which raises "Paquete vencido" for finite AND ilimitado alike — so the CTA
   *  must pre-empt the doomed button instead of dead-ending in the RPC (#118 E4). */
  vencido: boolean;
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
  favorita: boolean;
  coaches: string[];
}

/** The member's gym (tz + brand display name) from their `gym_membership` self-read —
 *  the RLS gate. Returns `null` for an anon/non-member caller (or an unreadable gym row)
 *  INSTEAD of throwing — the signed-in-but-not-yet-a-member state (audit #10/#15: a
 *  swallowed claim or a password-reset-first session must not crash the booking home) —
 *  mirroring the clase-miembro.ts twin. `marca` (gym.brand_name) is the brand-neutral
 *  display name the perfil footer renders from real data — never a hardcoded brand string.
 *
 *  Host reconciliation (audit #17 / spec §5.5): a member who belongs to several gyms sees
 *  the HOST gym's data on that gym's site — this prefers the membership whose gym matches
 *  the host tenant (`hostGymSlug` = the proxy's `x-gym`, presentation-only per ADR-0008),
 *  falling back to the OLDEST membership (a stable, deterministic choice — never the
 *  `limit(1)` roulette). It only picks among the caller's OWN memberships; RLS still scopes
 *  every downstream read, so the host can never surface data the caller doesn't already hold.
 *
 *  `cache()`-wrapped (perf): the page's three branches (agenda / saldo / perfil) each resolve
 *  the SAME member's gym for the SAME request — without this, that's 3 independent sequential
 *  2-query pairs (6 round trips) for identical input. React `cache()` keys on argument identity;
 *  `supabase` is safe to key on because `createClient()` (supabase.ts) is itself `cache()`-wrapped,
 *  so every caller in one request that passes `client: undefined` resolves the SAME instance —
 *  this is still per-request (React's request-scoped memoization), never module-level state. */
const resolverMiembroGym = cache(async function resolverMiembroGym(
  supabase: SupabaseServer,
  hostGymSlug?: string | null,
): Promise<{ id: string; tz: string; marca: string } | null> {
  // ONE request (embedded FK join) instead of the old membership-then-gym pair (perf):
  // gym_membership.gym_id → gym is a many-to-one FK, so PostgREST embeds `gym` as a
  // single object per row (verified against the local stack), never an array.
  const { data: memberships } = await supabase
    .from("gym_membership")
    .select("gym_id, created_at, gym(id, slug, timezone, brand_name)")
    .order("created_at", { ascending: true });
  if (!memberships || memberships.length === 0) return null;

  const enHost = hostGymSlug
    ? memberships.find((m) => m.gym?.slug === hostGymSlug)
    : undefined;
  const elegido = enHost ?? memberships[0]; // host match, else the oldest (stable fallback)
  const gym = elegido.gym;
  if (!gym) return null;

  return { id: elegido.gym_id, tz: gym.timezone, marca: gym.brand_name };
});

/**
 * Whether the signed-in caller currently holds a `gym_membership` row (the same
 * RLS self-read `resolverMiembroGym` gates on). Deliberately NOT `cache()`-wrapped:
 * the booking home (`/reservar`) re-checks this AFTER re-running the idempotent
 * claim within the same request (audit #10/#15's self-heal), so a stale
 * per-request-memoized `false` would defeat the retry.
 */
export async function getEsMiembro(client?: SupabaseServer): Promise<boolean> {
  const supabase = client ?? (await createClient());
  const { data } = await supabase.from("gym_membership").select("gym_id").limit(1).maybeSingle();
  return data != null;
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
  gymId: string,
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

  const [tiposRes, joinsRes, misReservasRes, favoritoId, activosBySession] = await Promise.all([
    supabase.from("class_type").select("id, name, sala, level, description").in("id", tipoIds),
    supabase.from("class_session_coach").select("session_id, coach_id").in("session_id", sessionIds),
    // The member's OWN active reservations among these sessions (RLS returns only their rows).
    supabase
      .from("reservation")
      .select("class_session_id")
      .in("class_session_id", sessionIds)
      .in("status", ["reservada", "asistida"]),
    fetchFavoritoId(supabase, gymId),
    // Occupancy only needs sessionIds (known since the class_session select above) — batched
    // here instead of sequenced after this Promise.all, so it no longer gates the coach fetch
    // below for no reason (perf).
    contarActivos(supabase, sessionIds),
  ]);
  if (tiposRes.error) throw tiposRes.error;
  if (joinsRes.error) throw joinsRes.error;
  if (misReservasRes.error) throw misReservasRes.error;

  const tipoById = new Map((tiposRes.data ?? []).map((t) => [t.id, t]));
  const misReservas = new Set((misReservasRes.data ?? []).map((r) => r.class_session_id));
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
      favorita: r.class_type_id === favoritoId,
      coaches: coachesBySession.get(r.id) ?? [],
    };
  });
}

interface ClienteRow {
  clases_restantes: number | null;
  vence: string | null;
  created_at: string | null;
  notificaciones_activadas: boolean | null;
  favorite_class_type_id: string | null;
}

/** The signed-in member's own `clientes` row (self-read, host-reconciled `gymId`, #74) — the
 *  ONE seam every reader below pulls its slice from (`clases_restantes` for the saldo, `created_at`
 *  / `notificaciones_activadas` for the perfil header, `favorite_class_type_id` for the "Tu
 *  favorita" tag). `cache()`-wrapped (perf): those readers used to each run their own narrow
 *  `.select()` against the same row — up to 4 round trips per request for one row. Keyed on
 *  `(supabase, gymId)`, same per-request-identity guarantee as `resolverMiembroGym`.
 *
 *  Returns the RAW `{ data, error }` — NOT a pre-swallowed row — because each consumer's error
 *  contract differs and pre-dates this dedupe: the saldo read THROWS on error (a balance is
 *  load-bearing; a silent 0 would be wrong), while the perfil header and the favorita flag are
 *  best-effort (a swallowed error degrades to "no date" / "not a favorite", never a crash). The
 *  shared query keeps the single round trip; the caller decides throw-vs-swallow. `data` is `null`
 *  when the caller has no cliente row in this gym. */
const fetchClienteRow = cache(async function fetchClienteRow(
  supabase: SupabaseServer,
  gymId: string,
): Promise<{ data: ClienteRow | null; error: { message: string } | null }> {
  const { data, error } = await supabase
    .from("clientes")
    .select("clases_restantes, vence, created_at, notificaciones_activadas, favorite_class_type_id")
    .eq("gym_id", gymId)
    .limit(1)
    .maybeSingle();
  return { data: data ?? null, error };
});

/** The signed-in member's favorite class-type id, from the shared `fetchClienteRow` seam; null
 *  when unset OR the row is unreadable. Best-effort (swallows a read error) — the "Tu favorita"
 *  tag is decorative, so a transient failure degrades to "no favorite" rather than crashing the
 *  agenda. Drives the tag across the week, the summary sheet, and mis reservas. */
async function fetchFavoritoId(supabase: SupabaseServer, gymId: string): Promise<string | null> {
  const { data } = await fetchClienteRow(supabase, gymId);
  return data?.favorite_class_type_id ?? null;
}

function toDTO(s: SesionMiembroRaw, estado: EstadoSesion, tz: string): SesionMiembroDTO {
  return {
    id: s.id,
    tipo: s.tipo,
    coaches: s.coaches.length ? s.coaches.join(" · ") : "Por asignar",
    hora: horaEnZona(s.startsAt, tz),
    horaFin: horaEnZona(new Date(s.startsAt.getTime() + s.duracionMin * 60_000), tz),
    duracionLabel: `${s.duracionMin} min`,
    inicioIso: s.startsAt.toISOString(),
    finIso: new Date(s.startsAt.getTime() + s.duracionMin * 60_000).toISOString(),
    estado,
    disponibles: disponibles(s.capacidad, s.activos),
    capacidad: s.capacidad,
    ocupacionPct: Math.round(ratioOcupacion(s.capacidad, s.activos) * 100),
    sala: s.sala,
    nivel: s.nivel,
    descripcion: s.descripcion,
    miReserva: s.miReserva,
    favorita: s.favorita,
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
  async (
    fechaIso?: string,
    client?: SupabaseServer,
    hostGymSlug?: string | null,
  ): Promise<AgendaSemanaMiembroDTO> => {
    const supabase = client ?? (await createClient());
    const miembro = await resolverMiembroGym(supabase, hostGymSlug);
    if (!miembro) return { dias: [] };
    const { id: gymId, tz } = miembro;

    const hoy = hoyEnZona(tz);
    const dia = fechaIso ? parseDay(fechaIso) : hoy;
    const lunes = inicioSemana(dia);

    const low = instanteEnZona(lunes, "00:00", tz);
    const high = instanteEnZona(addDays(lunes, 6), "00:00", tz);
    const crudas = await fetchSesionesMiembro(supabase, low, high, gymId);

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
 *
 * Host reconciliation (#74, audit #17 / spec §5.5): resolves the SAME gym the agenda
 * readers do (`resolverMiembroGym` — host-tenant match, else the oldest membership) and
 * scopes the balance read to that gym's clientes row, so a member holding rows in several
 * gyms reads THIS gym's saldo — never the `limit(1)` roulette. No membership → the same
 * safe default. `hostGymSlug` is the proxy's `x-gym` (presentation-only, ADR-0008).
 */
export const getSaldoMiembro = cache(
  async (
    client?: SupabaseServer,
    hostGymSlug?: string | null,
  ): Promise<SaldoMiembroDTO> => {
    const supabase = client ?? (await createClient());
    const miembro = await resolverMiembroGym(supabase, hostGymSlug);
    if (!miembro) return { ilimitado: false, clasesRestantes: 0, vencido: false };
    // The balance is load-bearing, so this read PROPAGATES a transient error (a swallowed 0
    // would silently understate the member's classes) — unlike the best-effort perfil/favorita
    // reads that share the same `fetchClienteRow` row.
    const { data: cli, error } = await fetchClienteRow(supabase, miembro.id);
    if (error) throw error;
    if (!cli) return { ilimitado: false, clasesRestantes: 0, vencido: false };
    // Expiry mirrors the reservar_clase gate EXACTLY (`vence < hoy` → "Paquete vencido"): a lapsed
    // vigencia blocks booking for finite AND ilimitado, so the CTA pre-empts the doomed button (#118
    // E4). vence-day itself is a valid training day (dias === 0, ruling C9), so expiry is `dias < 0`.
    const vencido = cli.vence ? diasRestantes(parseDay(cli.vence), hoyEnZona(miembro.tz)) < 0 : false;
    return { ilimitado: cli.clases_restantes === null, clasesRestantes: cli.clases_restantes, vencido };
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
  /** True when this booking's class type is the member's favorite (the "Favorita" chip). */
  favorita: boolean;
}

/**
 * The Perfil overlay's member data (slice #58): the identity "miembro desde" line and
 * the upcoming bookings. `desde` is the gym-local month-year the member's cliente row
 * was created (null when unknown). `reservas` are the member's own ACTIVE (reservada)
 * bookings for sessions that have NOT yet started, soonest first — a plain RLS read of
 * their own reservation rows (reservation_member_select), the same own-only surface the
 * agenda's `miReserva` flag uses. Occupancy is irrelevant here (these are the member's
 * own held spots), so this reader does NOT touch the contarActivos seam.
 *
 * `notificaciones` (slice #62) is the socio's in-app notifications PREFERENCE, read from
 * their own clientes row through the existing member SELECT policy — a preference only,
 * no delivery channel. `marca` is the gym's brand display name for the perfil footer.
 */
/** One plan as the perfil's "Cambiar plan" list renders it (slice #61): the public marketing surface a
 *  member reads through their own session, plus `current` (this is the member's active plan). `precioLabel`
 *  is formatted server-side so the client island imports no format helper. */
export interface PlanMembresiaDTO {
  id: string;
  name: string;
  subtitle: string | null;
  precioLabel: string;
  cadence: string | null;
  badge: string | null;
  popular: boolean;
  current: boolean;
}

export interface PerfilResumenMiembroDTO {
  desde: string | null;
  reservas: ProximaReservaDTO[];
  /** In-app notifications preference (default true / opted-in). */
  notificaciones: boolean;
  /** Brand display name (gym.brand_name) for the perfil footer — real data, brand-neutral. */
  marca: string;
  /** The signed-in member's plan card (slice #61): plan name, price, the "N de N clases" depletion gauge,
   *  renovación date, ∞ for ilimitado — derived from the RLS-privileged `mi_membresia()` scalars. null when
   *  the caller has no cliente row. */
  membresia: MembresiaDerivada | null;
  /** The gym's real plan catalog for the "Cambiar plan" mode, current plan marked. */
  planes: PlanMembresiaDTO[];
}

/** The signed-in member's plan card, derived from the `mi_membresia()` RPC's RLS-privileged scalars
 *  (Contract-A: raw ventas/asistencias never reach here — the RPC returns only the anchor monto/vigencia/
 *  day + the attendedSincePurchase count). Funnelled through the pure derive.ts sub-helpers so the number
 *  equals the admin ficha's. null when the caller has no cliente row. `paqueteNombre` also feeds the
 *  current-plan marking below. */
async function fetchMembresia(
  supabase: SupabaseServer,
  tz: string,
): Promise<{ membresia: MembresiaDerivada | null; paqueteNombre: string | null }> {
  const { data, error } = await supabase.rpc("mi_membresia");
  if (error) throw error;
  const row = data?.[0];
  if (!row) return { membresia: null, paqueteNombre: null };
  const membresia = derivarMembresia(
    {
      paqueteNombre: row.paquete_nombre,
      clasesRestantes: row.clases_restantes,
      vence: row.vence,
      anchorMonto: row.anchor_monto,
      anchorVigenciaTipo: row.anchor_vigencia_tipo,
      anchorVigenciaDias: row.anchor_vigencia_dias,
      attendedSincePurchase: row.attended_since_purchase,
    },
    hoyEnZona(tz),
  );
  return { membresia, paqueteNombre: row.paquete_nombre };
}

/** Safe default for a signed-in caller with no `gym_membership` row yet (audit #10/#15) —
 *  mirrors `getSaldoMiembro`'s no-row default rather than throwing. The page renders its
 *  own "sin membresía" state instead of this DTO in that case, so `marca`/`membresia`
 *  never need to be real here. */
const PERFIL_SIN_MEMBRESIA: PerfilResumenMiembroDTO = {
  desde: null,
  reservas: [],
  notificaciones: true,
  marca: "",
  membresia: null,
  planes: [],
};

export const getPerfilResumenMiembro = cache(
  async (
    client?: SupabaseServer,
    hostGymSlug?: string | null,
  ): Promise<PerfilResumenMiembroDTO> => {
    const supabase = client ?? (await createClient());
    const miembro = await resolverMiembroGym(supabase, hostGymSlug);
    if (!miembro) return PERFIL_SIN_MEMBRESIA;
    const { id: gymId, tz, marca } = miembro;

    // host-reconciled clientes row (#74), shared with the saldo/favorito reads via fetchClienteRow.
    // Best-effort (swallows a read error): the perfil header degrades to "no date" / opted-in
    // rather than crashing the overlay — the original per-consumer contract before the dedupe.
    const { data: cli } = await fetchClienteRow(supabase, gymId);
    const desde = cli?.created_at
      ? (() => {
          const d = fechaEnZona(cli.created_at, tz);
          return `${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`;
        })()
      : null;

    const [reservas, { membresia, paqueteNombre }, catalogo] = await Promise.all([
      fetchProximasReservas(supabase, tz, gymId),
      fetchMembresia(supabase, tz),
      // The member reads their own gym's catalog through their session (paquetes_/plan_feature_member_
      // _select, is_member_of); the anon reader is reused with the member client + their gym id.
      getPlanesPublicos(gymId, supabase),
    ]);

    // Mark the member's active plan by its unique per-gym grant label (clientes.paquete_nombre).
    const planes: PlanMembresiaDTO[] = catalogo.map((p) => ({
      id: p.id,
      name: p.name,
      subtitle: p.subtitle,
      precioLabel: pesos(p.precio),
      cadence: p.cadence,
      badge: p.badge,
      popular: p.popular,
      current: paqueteNombre !== null && p.nombre === paqueteNombre,
    }));

    return {
      desde,
      reservas,
      notificaciones: cli?.notificaciones_activadas ?? true,
      marca,
      membresia,
      planes,
    };
  },
);

/** The member's own reservada bookings for not-yet-started sessions, soonest first,
 *  joined to class_type + coaches — the same three-plain-reads assembly the week reader
 *  uses, keyed here off the reservation rows instead of a week window.
 *
 *  ONE request (embedded FK join) instead of the old reservation-then-session pair (perf):
 *  reservation.class_session_id → class_session is a many-to-one FK (verified against
 *  database.types.ts Relationships: `reservation_class_session_id_fkey`, isOneToOne: false),
 *  so PostgREST embeds `class_session` as a single object per row — same embed shape as
 *  `resolverMiembroGym`'s gym_membership → gym join above. The cancelled / not-yet-started
 *  filter and the starts_at sort that used to be DB predicates on the second query now run
 *  in JS over the embedded rows: the row volume here is the member's OWN active reservations
 *  (single digits), so this is free. The dedupe-by-session-id guard is preserved from the
 *  old `new Set(...)` even though a member shouldn't hold two reservada rows for one session. */
async function fetchProximasReservas(
  supabase: SupabaseServer,
  tz: string,
  gymId: string,
): Promise<ProximaReservaDTO[]> {
  const { data: reservas, error } = await supabase
    .from("reservation")
    .select("class_session_id, class_session(id, class_type_id, starts_at, duration_min, cancelled_at)")
    .eq("status", "reservada");
  if (error) throw error;

  const nowMs = Date.now();
  const vistos = new Set<string>();
  const rows: { id: string; class_type_id: string; starts_at: string; duration_min: number }[] = [];
  for (const r of reservas ?? []) {
    const sesion = r.class_session;
    if (!sesion || sesion.cancelled_at !== null) continue;
    if (new Date(sesion.starts_at).getTime() < nowMs) continue;
    if (vistos.has(sesion.id)) continue;
    vistos.add(sesion.id);
    rows.push(sesion);
  }
  rows.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
  if (rows.length === 0) return [];

  const tipoIds = [...new Set(rows.map((r) => r.class_type_id))];
  const [tiposRes, joinsRes, favoritoId] = await Promise.all([
    supabase.from("class_type").select("id, name, sala").in("id", tipoIds),
    supabase.from("class_session_coach").select("session_id, coach_id").in("session_id", rows.map((r) => r.id)),
    fetchFavoritoId(supabase, gymId),
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
      favorita: r.class_type_id === favoritoId,
    };
  });
}
