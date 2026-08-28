import "server-only";

import { cache } from "react";
import { z } from "zod";

import { contarLifecycle, type ContextoVeredicto, type CuboRenovar } from "@gym/domain/lifecycle";
import type { ResumenRoster } from "@gym/domain/types";
import { addDays, fechaEnZona, hoyEnZona, hoyIsoEnZona, iniciales, isTelValido, toIsoDay } from "@gym/format";
import { createClient, type SupabaseServer } from "./supabase";

import { requireOperator } from "./_auth";
import {
  derivarCliente,
  derivarInvitacion,
  derivarPaseCliente,
  esPrimeraCompra,
  momentoEnZona,
  shapeFicha,
  type ClienteDerivado,
  type FichaAsistRow,
  type FichaDerivada,
  type FichaReservaRow,
  type InvitacionDerivada,
  type PaseClienteDTO,
} from "./derive";
import { getCobro } from "./cobro";
import { getOperatorGym } from "./gym";
import { enviarInvitacion, type EnvioResult, type MailTransport } from "./invitaciones";
import { getPaquetes, getPaseSueltoNombres, type PaqueteDTO } from "./paquetes";
import { resolverIdentidad } from "./perfil";
import { EMAIL_EN_USO_MSG, EmailEnUsoError } from "./ventas";
import { fmtDatosPago, fmtPrecios } from "./plantilla-ctx";
import { listarPlantillas } from "./plantillas";
import { getVecinos, type Vecinos } from "./roster-nav";

export type { PaseClienteDTO, FichaAsistencia, FichaPago } from "./derive";

export interface ClienteLiteDTO {
  id: string;
  nombre: string;
  tel: string | null;
  inicial: string;
  /** Active package label, or "Sin paquete". */
  paqueteLabel: string;
  /** Contact email (not the connector) — carried so the Vender NUEVO soft
   *  duplicate warn can match a typed email against the loaded roster with no
   *  extra round trip. NEVER the claim_code (bearer credential, never in a DTO). */
  email: string | null;
  /** Derived invite state + es-MX badge for the picker (ADR-0015). */
  invitacion: InvitacionDerivada;
  /** True when the member has never had a sale (#77) — the Vender preselect /
   *  picker marks it PRIMERA COMPRA and the receipt snapshots it. Precomputed via
   *  the ventas_count_por_cliente RPC (a grouped DB-side count, run once per read
   *  in parallel with the roster select — never a per-row embed or fallback query). */
  primeraCompra: boolean;
}

/** Minimal roster for the venta client-picker, ordered by name. */
export const getClientesLite = cache(
  async (client?: SupabaseServer): Promise<ClienteLiteDTO[]> => {
    const supabase = client ?? (await createClient());
    // `.eq("gym_id", …)` on every staff read (spec 2026-07-13 §1.1): a scope
    // selector, not a boundary — RLS stays the boundary (ADR-0001); the eq flips
    // the correlated-SubPlan seq scan into an index condition and keeps a
    // multi-membership operator's roster to THIS gym.
    const gym = await getOperatorGym(supabase);
    const tz = gym.timezone;
    // Two independent reads instead of a correlated `ventas(count)` embed (which Postgres
    // evaluates once PER row of the 500-cliente roster): the roster select stays a plain
    // index scan, and ventas_count_por_cliente does the grouping DB-side in one pass.
    const [{ data }, { data: counts }] = await Promise.all([
      supabase
        .from("clientes")
        .select("id, nombre, tel, paquete_nombre, email, invitacion_enviada_at, auth_user_id, created_at")
        .eq("gym_id", gym.id)
        .order("nombre"),
      supabase.rpc("ventas_count_por_cliente", { p_gym_id: gym.id }),
    ]);

    if (!data) return [];

    const ventasPorCliente = new Map((counts ?? []).map((r) => [r.cliente_id, r.n]));

    return data.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      tel: c.tel,
      inicial: iniciales(c.nombre),
      paqueteLabel: c.paquete_nombre ?? "Sin paquete",
      email: c.email,
      invitacion: derivarInvitacion(c, tz),
      primeraCompra: esPrimeraCompra(ventasPorCliente.get(c.id) ?? 0),
    }));
  },
);

/** Roster for the pase de lista, derived-at-read (ADR-0002): a thin fetch that
 *  defers each row to the pure, tested derivarPaseCliente. `porRenovar` is the
 *  row's own veredicto, shared with the directory/dashboard — not an inline `<= 5`
 *  that drops the clases dimension. `paseSuelto` (#225 F2) is the gym's catalog, so
 *  a spent one-off pass reads correctly here too — this read used to have no catalog
 *  fetch of its own, and diverged from the roster/export. */
export const getClientesParaPase = cache(
  async (client?: SupabaseServer): Promise<PaseClienteDTO[]> => {
    const supabase = client ?? (await createClient());
    const gym = await getOperatorGym(supabase); // resolved FIRST — the read is gym-scoped (§1.1)
    const [{ data }, paseSuelto] = await Promise.all([
      supabase
        .from("clientes")
        .select("id, nombre, tel, paquete_nombre, clases_restantes, vence, auth_user_id")
        .eq("gym_id", gym.id)
        .order("nombre"),
      getPaseSueltoNombres(supabase),
    ]);

    if (!data) return [];

    const ctx: ContextoVeredicto = { hoy: hoyIsoEnZona(gym.timezone), pasesSueltos: paseSuelto };
    return data.map((c) => derivarPaseCliente(c, ctx));
  },
);

function monthStartIso(hoy: Date): string {
  return toIsoDay(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
}

/** The ficha's rolling attendance window length, in days (ADR/spec 2026-06-01).
 *  One constant, easy to retune; the directory keeps its own this-month count. */
const FICHA_VENTANA_DIAS = 30;

/** The bookings leg of the saldo derivation (slice 2 §D1). `member_id` joins `clientes.id`;
 *  the session embed is `!inner` because the read FILTERS on it — a booking whose session row
 *  is gone can't be placed on the calendar anyway. `duration_min` is the noShow/apartada
 *  boundary's other half (`class_session` has no `ends_at`); the name columns let a
 *  "No asistió — cargada" line name its class through the same `etiquetaClase` ladder. */
const RESERVA_COLUMNS =
  "id, created_at, consumio, status, class_session_id, class_session!inner(starts_at, duration_min, is_special, special_name, class_type(name))";

/** Bookings whose CLASS falls at/after `desdeDia` (gym-local day), with no upper bound so the
 *  future holds the Apartadas count needs come along. Bounded on the session rather than on
 *  `created_at`: a class booked days BEFORE the anchor sale but held after it still has to be
 *  in hand, or its check-in would be counted a second time on the asistencia leg. */
function leerReservas(
  supabase: SupabaseServer,
  clienteId: string,
  gymId: string,
  desdeDia: string,
) {
  return supabase
    .from("reservation")
    .select(RESERVA_COLUMNS)
    .eq("member_id", clienteId)
    // Scope selector, not a boundary (spec 2026-07-13 §1.1) — RLS stays the boundary.
    .eq("gym_id", gymId)
    // 00:00Z is at or before the gym-local start of that day for every MX zone (UTC−6/−7), so
    // the window can only ever be a few hours WIDER than asked, never narrower.
    .gte("class_session.starts_at", `${desdeDia}T00:00:00Z`);
}

/** A roster row plus its derived invite state (ADR-0015). Extends the pure
 *  ClienteDerivado the directory renders — every lifecycle fact (estado, urgencia,
 *  tile, por renovar, pendienteOnline, ausencia, días/clases) rides on its single
 *  `veredicto`, never as flat siblings a screen could read instead. */
export interface ClienteRosterDTO extends ClienteDerivado {
  invitacion: InvitacionDerivada;
}

/** The exact column list both roster reads select — named once so the two windows
 *  can never drift apart (#240 pins their ORDER for the same reason). */
const ROSTER_COLUMNS =
  "id, nombre, tel, paquete_nombre, clases_restantes, vence, email, invitacion_enviada_at, auth_user_id, created_at";

type RosterRow = {
  id: string;
  nombre: string;
  tel: string | null;
  paquete_nombre: string | null;
  clases_restantes: number | null;
  vence: string | null;
  email: string | null;
  invitacion_enviada_at: string | null;
  auth_user_id: string | null;
  created_at: string;
};

/** The two last-visit facts (#226) keyed by cliente, in the shape `HechosCliente`
 *  states them. A cliente missing from the aggregate has simply never visited. */
type VisitasPorCliente = Record<string, { ultima: string | null; ultimaConsumida: string | null }>;

function visitasPorCliente(
  rows: { cliente_id: string; ultima_visita: string | null; ultima_visita_consumida: string | null }[] | null,
): VisitasPorCliente {
  const porCliente: VisitasPorCliente = {};
  for (const r of rows ?? []) {
    porCliente[r.cliente_id] = { ultima: r.ultima_visita, ultimaConsumida: r.ultima_visita_consumida };
  }
  return porCliente;
}

/** The mapper both roster reads share: the roster select's own columns, the visit
 *  aggregate and the catalog, folded into ONE `derivarCliente` call per row. Both
 *  reads run THIS function, so INICIO's counts and the directory's list are the same
 *  verdicts by construction — not two assemblies kept in step by review, which is
 *  exactly how the ficha and the export drifted from both of them. */
function mapearRoster(
  clientes: RosterRow[],
  ctx: ContextoVeredicto,
  tz: string,
  counts: Record<string, number>,
  visitas: VisitasPorCliente,
): ClienteRosterDTO[] {
  return clientes.map((c) => {
    const altaIso = toIsoDay(fechaEnZona(c.created_at, tz));
    return {
      ...derivarCliente(c, ctx, counts[c.id] ?? 0, {
        ultima: visitas[c.id]?.ultima ?? null,
        ultimaConsumida: visitas[c.id]?.ultimaConsumida ?? null,
        // #226 F5: a never-visited row floors its ausente clock on alta instead of
        // reading as "never absent".
        alta: altaIso,
      }),
      invitacion: derivarInvitacion(c, tz),
    };
  });
}

/** Full roster, derived-at-read with this month's attendance count per client. */
export const getClientesRoster = cache(
  async (client?: SupabaseServer): Promise<ClienteRosterDTO[]> => {
    const supabase = client ?? (await createClient());
    const gym = await getOperatorGym(supabase);
    const tz = gym.timezone;
    const hoy = hoyEnZona(tz);

    // The roster genuinely needs every cliente row; the asistencias legs are grouped
    // DB-side aggregates (asistencias_mes_por_cliente for the count, asistencias_ultima_
    // visita_por_cliente for the two last-visit facts, #226) — never a row pull tallied in
    // JS. `paseSuelto` is the small catalog leg estado needs (#225): a roster row stores
    // only the sold package's display name, never its class GRANT, so esPaseSuelto (the
    // membership-vs-drop-in predicate) has to resolve against the catalog — via the
    // error-surfacing getPaseSueltoNombres (#225 F5), not getPaquetes' best-effort [].
    const [clientesRes, countsRes, paseSuelto, ultimasRes] = await Promise.all([
      supabase
        .from("clientes")
        .select(ROSTER_COLUMNS)
        .eq("gym_id", gym.id)
        .order("nombre"),
      supabase.rpc("asistencias_mes_por_cliente", {
        p_gym_id: gym.id,
        p_desde: monthStartIso(hoy),
      }),
      getPaseSueltoNombres(supabase),
      supabase.rpc("asistencias_ultima_visita_por_cliente", { p_gym_id: gym.id }),
    ]);

    const clientes = clientesRes.data;
    if (!clientes) return [];

    // Fail loud (#226 F4), mirroring the getPaseSueltoNombres precedent (#225 F5): a swallowed error
    // here (`?? []`) would silently read as "nobody in this gym has ever visited" — every row falls
    // back to the alta floor and the whole roster looks ausente. asistencias_mes_por_cliente's
    // countsRes is NOT given the same treatment because it predates this convention (pre-existing,
    // out of #226's scope) — only the new leg this ticket adds is held to it.
    if (ultimasRes.error) throw ultimasRes.error;

    const counts: Record<string, number> = {};
    for (const r of countsRes.data ?? []) counts[r.cliente_id] = r.n;

    return mapearRoster(
      clientes,
      { hoy: toIsoDay(hoy), pasesSueltos: paseSuelto },
      tz,
      counts,
      visitasPorCliente(ultimasRes.data),
    );
  },
);

/** The roster headline counts plus `nuevosOnline` — the dashboard's "Nuevos
 *  registros online" tile: auth-linked (Door 2) members who never bought a package,
 *  the same `veredicto.pendienteOnline` population the roster filter chip surfaces.
 *  `porRenovar` (#228) is INICIO's POR RENOVAR tile: the SAME verdicts the
 *  directory's filter/count and the pase de lista badge read — never a second
 *  restatement — plus the day/clases bucket breakdown, which `contarLifecycle`
 *  guarantees sums to `porRenovar.total` (every por_renovar row carries exactly one
 *  `cubo`). */
export interface RosterResumenDTO extends ResumenRoster {
  nuevosOnline: number;
  porRenovar: { total: number; cubos: Record<CuboRenovar, number> };
  /** INICIO's AÚN A TIEMPO tile (#229) — the SAME `contarLifecycle`/tile predicate
   *  the directory's own AÚN A TIEMPO filter/count read, so the tile's count and
   *  `/clientes?atiempo=1`'s row count can never disagree (spec story 19). */
  aunATiempo: { total: number };
  /** The day-16+ horizon disclosure (#229 opus review F3) — vencido, not a
   *  one-off pass, past `RECUPERACION_DIAS` since expiry. The tile's own
   *  footer line names this count so the "N ya pasaron ese límite" fact
   *  (Fitco) isn't silently dropped. */
  fueraDeAlcance: number;
}

/** `vigentes`/`total`/`nuevosOnline`/`porRenovar`/`aunATiempo` for the dashboard,
 *  derived-at-read (ADR-0002, #225, #228, #229). Runs the SAME `mapearRoster` the
 *  directory does and folds the result with `contarLifecycle`, so none of these
 *  counts can ever disagree with that screen (never a hand-rolled `.gte()`/`.or()`
 *  restatement of the bands, the pre-#225 shape's exact "two live meanings of a
 *  band" bug). `paseSuelto` is the small catalog leg the veredicto needs (a roster
 *  row's `paquete_nombre` carries no grant), fetched via the error-surfacing
 *  getPaseSueltoNombres (#225 F5). `asistencias_ultima_visita_por_cliente` (#226)
 *  is a grouped DB-side read run in parallel with it, never a per-row asistencias
 *  pull and never a second roster fetch (#228's perf budget, held). The
 *  asistencias-count leg is deliberately NOT fetched here: this read renders no
 *  per-row attendance number, so every row passes 0. */
export const getRosterResumen = cache(
  async (client?: SupabaseServer): Promise<RosterResumenDTO> => {
    const supabase = client ?? (await createClient());
    const gym = await getOperatorGym(supabase);
    const tz = gym.timezone;
    const hoy = hoyEnZona(tz);

    const [{ data: clientesData }, paseSuelto, ultimasRes] = await Promise.all([
      supabase
        .from("clientes")
        // The SAME column list the directory reads (ROSTER_COLUMNS): id/nombre/tel are
        // unused by this read but the shared mapper's input shape requires them — cheap
        // columns, no extra round trip.
        .select(ROSTER_COLUMNS)
        .eq("gym_id", gym.id)
        // #240: ordered, matching getClientesRoster's window — the two roster reads must
        // truncate the SAME 1000-row slice at scale, not different unordered ones.
        .order("nombre"),
      getPaseSueltoNombres(supabase),
      // The SAME asistencias_ultima_visita_por_cliente RPC getClientesRoster reads
      // (#226): one grouped DB-side read, not a full-roster asistencias pull.
      supabase.rpc("asistencias_ultima_visita_por_cliente", { p_gym_id: gym.id }),
    ]);

    // Fail loud (#226 F4 precedent): a swallowed error here would silently read as
    // "nobody in this gym has ever visited" — every row falls back to the alta floor
    // and AÚN A TIEMPO / the ausente math would be built on a false absence.
    if (ultimasRes.error) throw ultimasRes.error;

    const filas = mapearRoster(
      clientesData ?? [],
      { hoy: toIsoDay(hoy), pasesSueltos: paseSuelto },
      tz,
      {}, // this read renders no per-row attendance number — every row passes 0
      visitasPorCliente(ultimasRes.data),
    );

    const { vigentes, total, porRenovar, aunATiempo, fueraDeAlcance, pendienteOnline: nuevosOnline } =
      contarLifecycle(filas);

    return { vigentes, total, nuevosOnline, porRenovar, aunATiempo, fueraDeAlcance };
  },
);

/** Everything the ficha (client detail) renders: the pure derivation (FichaDerivada,
 *  shaped + tested in derive.ts) plus the I/O-sourced today + swipe neighbors. */
export type ClienteFichaDTO = FichaDerivada & {
  hoyIso: string;
  vecinos: Vecinos;
  /** Derived invite state + es-MX badge for the ficha header (ADR-0015). */
  invitacion: InvitacionDerivada;
  /** Contact email — the edit sheet's backfill field (S3, issue #71). Hidden/disabled once the row is
   *  claimed (`invitacion.estado === "cuenta_activa"`): the verified login email owns it then (D5). */
  email: string | null;
  /** The gym's package catalog (paquete-swap spec §4/§5.1) — the PagoSheet's swap picker's tile
   *  list. ZERO extra I/O: `getClienteFicha` already fetches this via `getPaquetes` for the
   *  `{precios}` plantilla token below; this just returns the same array. Deliberately NOT pushed
   *  into `derive.ts`/`FichaDerivada` — like `hoyIso`, it's I/O-sourced, not a pure derivation. */
  paquetes: PaqueteDTO[];
};

/** The ficha, derived-at-read (ADR-0002): a thin fetch that defers all shaping to
 *  the pure, tested shapeFicha; the wrapper owns only I/O + assembling hoyIso/vecinos. */
export const getClienteFicha = cache(
  async (id: string, client?: SupabaseServer): Promise<ClienteFichaDTO | null> => {
    const supabase = client ?? (await createClient());
    const gym = await getOperatorGym(supabase);
    const tz = gym.timezone;
    const hoy = hoyEnZona(tz);
    const hoyIso = toIsoDay(hoy);

    // Deliberate waterfall: await the cliente FIRST so a not-found id returns
    // early without firing the 5 downstream reads. Folding all 6 into one
    // Promise.all would waste 5 queries on every 404; one extra round trip on
    // the happy path is the accepted cost.
    const { data: c } = await supabase
      .from("clientes")
      .select(
        "id, nombre, tel, paquete_nombre, clases_restantes, vence, created_at, email, invitacion_enviada_at, auth_user_id",
      )
      .eq("id", id)
      .maybeSingle();
    if (!c) return null;

    // Rolling 30-day window (Part A). The lower bound is fixed at today−30d here so
    // this read stays independent of ventasRes inside the Promise.all; an old last
    // purchase (predating the window) is reconciled by the exact count below (Part B).
    const ventanaIso = toIsoDay(addDays(hoy, -FICHA_VENTANA_DIAS));

    const [asistRes, ventasRes, reservasRes, vecinos, perfilRes, plantillas, paquetes, cobro, paseSuelto] =
      await Promise.all([
        supabase
          .from("asistencias")
          // `class_session_id` is the visit's CONTEXT (#89): the ficha's toggle owns the
          // ACCESO LIBRE row alone, so the read has to say which rows are class visits or
          // the checked state would describe a row the toggle cannot undo. The nested
          // embed (#178) names WHICH class, so two visits on one day are told apart by
          // the class + its hour instead of by `hora` — the arrival stamp, which reads
          // the same 23:11 for two marks 17 seconds apart. `origen` is the visit's stated
          // PROVENANCE (#178): null on a pre-#89 row, which the historial must render "—",
          // never assert ACCESO LIBRE for. A many-to-one FK embed + one existing column on
          // the select that is already here: no extra round trip, no migration.
          // `reservation_id` (slice 2 §D0) is the join that keeps a booking-charged check-in
          // from being counted on BOTH legs — one column on a select already being made.
          .select(
            "fecha, hora, consumio, perdonada, class_session_id, origen, reservation_id, class_session(starts_at, is_special, special_name, class_type(name))",
          )
          .eq("cliente_id", id)
          .is("deleted_at", null)
          .gte("fecha", ventanaIso)
          .order("fecha", { ascending: false }),
        supabase
          .from("ventas")
          .select("id, folio, fecha, created_at, paquete_nombre, monto, metodo, clases, vigencia_tipo, vigencia_dias")
          .eq("cliente_id", id)
          // The saldo anchor is the LAST-WRITTEN sale (created_at desc, id desc — never
          // fecha, which a backdate can push into the past), matching mi_membresia (spec
          // §D3/C1). `fecha` still drives the DISPLAY (compradoDisplay / días-gauge anchor).
          .order("created_at", { ascending: false })
          .order("id", { ascending: false }),
        // The bookings leg (§D1). Same 30-day floor as the asistencias window so the common
        // case needs no second round trip; an anchor older than that re-reads from the anchor
        // day below, exactly like the asistencia head-count does.
        leerReservas(supabase, id, gym.id, ventanaIso),
        getVecinos(id, supabase),
        supabase.from("perfil").select("negocio").eq("gym_id", gym.id).maybeSingle(),
        listarPlantillas(supabase),
        // Best-effort for the {precios} display token (a swallowed error here just
        // shows an empty price list) — NOT the same leg as the estado-critical
        // paseSuelto Set below (#225 F2/F5), which must not silently degrade.
        getPaquetes(supabase, tz).catch(() => []),
        getCobro(supabase).catch(() => null),
        getPaseSueltoNombres(supabase),
      ]);

    const negocio = resolverIdentidad(
      {
        negocio: perfilRes.data?.negocio ?? null,
        coach: null,
        ciudad: null,
      },
      gym.brandName,
    ).negocio;

    // The saldo's asistencia leg (slice 2 §D0, replacing the #173 VISIT count this branch used
    // to produce). Counted at/after the anchor sale's WRITE INSTANT (created_at, not fecha —
    // C2/C14), not just its calendar day: a check-in earlier the same day as a renewal was
    // already spent from the pre-renewal balance, so day-granularity double-counts it, and a
    // backdated fecha would wrongly re-count gap visits that already decremented the balance
    // live. `momentoEnZona` gives the gym-local calendar day plus the "HH:MM:SS" wall clock,
    // directly string-comparable against asistencias.hora (a Postgres `time`). Null `hora`
    // (back-entry rows) are counted: no recorded time can prove they preceded the sale.
    const ventas = ventasRes.data ?? [];
    const ventaInstante = ventas[0] ? momentoEnZona(ventas[0].created_at, tz) : null;
    let reservas = (reservasRes.data ?? []) as FichaReservaRow[];
    // null = the fetched asistencias already reach the anchor, so derive.ts counts them itself
    // with the full §D0 rule (including the reservation dedupe it can see row by row).
    let cargadasFueraDeVentana: number | null = null;
    if (ventaInstante && ventaInstante.dia < ventanaIso) {
      // Old purchase predating the window: a tiny exact head-count keeps the counts correct
      // without widening the historial fetch — grown for §D0 (§D4's fallback rule) with a
      // bookings read from the anchor day, which serves BOTH the reservation leg and the
      // dedupe below.
      const { dia: ventaDia, hora: ventaHora } = ventaInstante;
      const [cabeza, reservasAncla] = await Promise.all([
        supabase
          .from("asistencias")
          .select("id", { count: "exact", head: true })
          .eq("cliente_id", id)
          .eq("perdonada", false)
          .is("deleted_at", null)
          .or(`fecha.gt.${ventaDia},and(fecha.eq.${ventaDia},or(hora.gte.${ventaHora},hora.is.null))`),
        leerReservas(supabase, id, gym.id, ventaDia),
      ]);
      reservas = (reservasAncla.data ?? []) as FichaReservaRow[];
      // §D0's asistencia leg drops marks whose booking already charged. The head-count can't
      // express that join, so subtract them: a charged booking that was checked in is exactly
      // one 'asistida' row here (both check-in RPCs stamp that status), and its mark is inside
      // the counted range by construction — the class cannot start before it was booked.
      const yaContadasEnReserva = reservas.filter((r) => r.consumio && r.status === "asistida").length;
      cargadasFueraDeVentana = Math.max(0, (cabeza.count ?? 0) - yaContadasEnReserva);
    }

    const ficha = shapeFicha(
      c,
      // `origen` is narrower than the generated `string | null` column type here — the
      // DB CHECK (asistencias_origen_kind_ck) backs the two literals FichaAsistRow declares.
      (asistRes.data ?? []) as FichaAsistRow[],
      ventas,
      // The ficha reads no visit aggregate, so its veredicto carries `ausencia: null`
      // (shapeFicha passes "no_leidas") — it renders no {n}D SIN VENIR badge.
      { hoy: hoyIso, pasesSueltos: paseSuelto },
      tz,
      plantillas,
      negocio,
      // `ahora` is the read's real instant — the only thing that can tell an apartada (class
      // still to come) from a "No asistió — cargada" (class already over).
      { reservas, cargadasFueraDeVentana, ahora: new Date() },
      { precios: fmtPrecios(paquetes), datos_pago: fmtDatosPago(cobro) },
    );

    return { ...ficha, hoyIso, vecinos, invitacion: derivarInvitacion(c, tz), email: c.email, paquetes };
  },
);

/** Identity-edit input (nombre + optional tel + optional email). Trims like crearVenta; a tel, WHEN
 *  PRESENT, is the canonical 10-digit MX rule (isTelValido) — the same rule the DB CHECK
 *  (clientes_tel_10_digits_ck) states, which since #190 reads `tel is null or …`. Blank tel is legal and
 *  means CLEAR (the RPC writes p_tel unconditionally), which is how the placeholder phone gets removed;
 *  it is sent as `null`, never `''` (the CHECK rejects '' — it strips to 0 digits). `email` is OPTIONAL
 *  and `.email()`-VALIDATED (design §4) — unlike the sale-path `email` field (crearVentaSchema in
 *  ventas.ts, deliberately unvalidated: cash sale never gated), this surface is an edit, not a sale, so
 *  validation is safe here. Blank/whitespace-only email means "no change" (preprocessed to `undefined`,
 *  never forwarded as `''`) — this slice has no explicit "clear the email" arm. */
export const actualizarClienteSchema = z.object({
  clienteId: z.string().uuid(),
  nombre: z.string().trim().min(3),
  tel: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().refine(isTelValido, { message: "Teléfono inválido" }).optional(),
  ),
  email: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().email("Correo inválido").optional(),
  ),
});

export type ActualizarClienteInput = z.infer<typeof actualizarClienteSchema>;

/** `actualizarCliente`'s result: the auto-invite outcome (ADR-0015 §3 backfill path — issue #71). `null`
 *  when no email arm was sent, the email was unchanged, or the row is already claimed; a value otherwise,
 *  mirroring `enviarInvitacion`'s own best-effort contract (never thrown, always surfaced). */
export interface ActualizarClienteResult {
  invite: EnvioResult | null;
}

/** Edit a client's identity (nombre + tel + optional email backfill). Injectable client (ADR-0001).
 *  The actualizar_cliente RPC re-checks auth.uid(), RLS scopes the UPDATE to the owner (SECURITY INVOKER),
 *  and — in the SAME round trip — reports whether the email was newly set/changed AND whether the row was
 *  unclaimed at write time; only that combination fires the auto-invite (a claimed row's email is guarded
 *  server-side too, defense in depth). `opts.transport` is the same injectable mail-transport seam
 *  `enviarInvitacion` exposes (ADR-0001) — its test double is this function's second consumer. */
export async function actualizarCliente(
  raw: unknown,
  client?: SupabaseServer,
  opts: { transport?: MailTransport } = {},
): Promise<ActualizarClienteResult> {
  const input = actualizarClienteSchema.parse(raw);
  const supabase = client ?? (await createClient());

  await requireOperator(supabase);

  const { data, error } = await supabase
    .rpc("actualizar_cliente", {
      p_cliente_id: input.clienteId,
      p_nombre: input.nombre,
      // A blank edit sends null — never '' (the CHECK strips it to 0 digits) and never an omitted
      // key (p_tel has no DEFAULT, so PostgREST could not resolve the function). The cast covers a
      // generator gap: supabase's type gen never models RPC argument nullability.
      p_tel: input.tel ?? (null as unknown as string),
      ...(input.email ? { p_email: input.email } : {}),
    })
    .single();
  // The email backfill can collide with clientes_email_gym_uq (another row in the gym holds it) — the
  // RPC raises the EMAIL_EN_USO_MSG string (mirrors the vender path), so surface it typed for the ficha.
  if (error?.message === EMAIL_EN_USO_MSG) throw new EmailEnUsoError();
  if (error || !data) throw new Error("No se pudo actualizar el cliente");

  const invite =
    data.email_changed && data.unclaimed
      ? await enviarInvitacion(
          { clienteId: input.clienteId },
          { transport: opts.transport, client: supabase },
        )
      : null;

  return { invite };
}

/** Re-send the SAME invite code from the ficha (design §3 REENVIAR — issue #71). A thin named alias over
 *  `enviarInvitacion` (no new logic — the RPC chain already IS the re-send: `preparar_invitacion` reuses
 *  the existing code when one is set): the ficha's REENVIAR button and "enviar invitación" (sin_invitar)
 *  both call this. `opts.transport` mirrors `enviarInvitacion`'s injectable seam. */
export async function reenviarInvitacion(
  clienteId: string,
  client?: SupabaseServer,
  opts: { transport?: MailTransport } = {},
): Promise<EnvioResult> {
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  return enviarInvitacion({ clienteId }, { transport: opts.transport, client: supabase });
}
