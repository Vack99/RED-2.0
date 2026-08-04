import "server-only";

import { cache } from "react";
import { z } from "zod";

import { contarLifecycle, derivarLifecycle, type CuboRenovar, type FilaLifecycle, type Tile } from "@gym/domain/lifecycle";
import type { Clases, ResumenRoster } from "@gym/domain/types";
import { addDays, fechaEnZona, hoyEnZona, iniciales, isTelValido, parseDay, toIsoDay } from "@gym/format";
import { createClient, type SupabaseServer } from "./supabase";

import { requireOperator } from "./_auth";
import {
  derivarCliente,
  derivarInvitacion,
  derivarPaseCliente,
  esPrimeraCompra,
  esRegistroOnlinePendiente,
  estadoInvitacion,
  shapeFicha,
  type ClienteDerivado,
  type FichaDerivada,
  type InvitacionDerivada,
  type PaseClienteDTO,
} from "./derive";
import { getCobro } from "./cobro";
import { getOperatorGym } from "./gym";
import { enviarInvitacion, type EnvioResult, type MailTransport } from "./invitaciones";
import { getPaquetes, getPaseSueltoNombres } from "./paquetes";
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
  /** The client's alta day as a gym-tz "YYYY-MM-DD" (from created_at) — the floor for
   *  the Vender backdate picker (spec D6: min = max(today−30, alta); a sale can never
   *  predate the client). The RPC is the real bound; this only constrains the calendar. */
  altaIso: string;
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
      altaIso: toIsoDay(fechaEnZona(c.created_at, tz)),
      primeraCompra: esPrimeraCompra(ventasPorCliente.get(c.id) ?? 0),
    }));
  },
);

/** Roster for the pase de lista, derived-at-read (ADR-0002): a thin fetch that
 *  defers each row to the pure, tested derivarPaseCliente. `porVencer` is the
 *  domain's esPorRenovar predicate, shared with the directory/dashboard — not an
 *  inline `<= 5` that drops the clases dimension. `paseSuelto` (#225 F2) is the
 *  gym's catalog, so a spent one-off pass reads correctly here too — this read
 *  used to have no catalog fetch of its own, and diverged from the roster/export. */
export const getClientesParaPase = cache(
  async (client?: SupabaseServer): Promise<PaseClienteDTO[]> => {
    const supabase = client ?? (await createClient());
    const gym = await getOperatorGym(supabase); // resolved FIRST — the read is gym-scoped (§1.1)
    const [{ data }, paseSuelto] = await Promise.all([
      supabase
        .from("clientes")
        .select("id, nombre, tel, paquete_nombre, clases_restantes, vence")
        .eq("gym_id", gym.id)
        .order("nombre"),
      getPaseSueltoNombres(supabase),
    ]);

    if (!data) return [];

    const hoy = hoyEnZona(gym.timezone);
    return data.map((c) => derivarPaseCliente(c, hoy, paseSuelto));
  },
);

function monthStartIso(hoy: Date): string {
  return toIsoDay(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
}

/** The gym-local "HH:MM:SS" wall clock for a timestamptz — matches the Postgres
 *  `time` literal format asistencias.hora is stored in, so a venta's instant can be
 *  string-compared against it directly (C14, clases-gauge anchor). Seconds matter
 *  here (unlike @gym/format's `horaEnZona`, "HH:MM" for display): truncating to the
 *  minute would misclassify a check-in seconds apart from the venta on the same
 *  minute. */
function horaSegEnZona(isoTimestamp: string, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(isoTimestamp));
}

/** The ficha's rolling attendance window length, in days (ADR/spec 2026-06-01).
 *  One constant, easy to retune; the directory keeps its own this-month count. */
const FICHA_VENTANA_DIAS = 30;

/** A roster row plus its derived invite state and the online-pending flag the
 *  dashboard tile + roster filter share (ADR-0015). Extends the pure ClienteDerivado
 *  the directory already renders; the invite fields are attached at read. */
export interface ClienteRosterDTO extends ClienteDerivado {
  invitacion: InvitacionDerivada;
  /** Auth-linked (Door 2) member with no active package — the roster filter chip. */
  pendienteOnline: boolean;
  /** The membership-vs-drop-in fact (#225 F4) — lets the directory's "por renovar"
   *  filter/count call the SAME `esPorRenovar` predicate the tile/pase de lista use,
   *  with the pase-suelto exemption intact, instead of re-deriving it client-side
   *  from a raw `paquete_nombre` string match. */
  esPaseSuelto: boolean;
  /** Last visit of ANY kind (gym-local "YYYY-MM-DD", or null for never-visited) — the
   *  AUSENTE clock (#226). Sourced from asistencias_ultima_visita_por_cliente; never a
   *  full asistencias row pull. */
  ultimaVisita: string | null;
  /** Last CONSUMING visit only (`consumio = true`) — the CLASES clock (#226/#222): a
   *  walk-in ACCESO LIBRE visit must not reset it. Same source RPC as `ultimaVisita`. */
  ultimaVisitaConsumida: string | null;
  /** The client's alta day as a gym-tz "YYYY-MM-DD" (from created_at) — the badge's
   *  SECOND input (#226 F5): when `ultimaVisita` is null (never attended), the ausente
   *  clock has no visit to anchor on and falls back to alta instead of reading as
   *  "never absent". Mirrors getClientesLite's altaIso (same column, same conversion);
   *  `created_at` rides the existing roster select — zero extra reads. */
  altaIso: string;
  /** INICIO/CLIENTES tile membership (#229) — the FULL lifecycle engine's real
   *  verdict (`derivarLifecycle`, not the thin `derivarFilaLifecycle` #227/#228 used
   *  before this row carried `tieneCuenta`/the visit clocks): "por_renovar",
   *  "aun_a_tiempo", or null. The directory's AÚN A TIEMPO filter/count reads this
   *  directly — the SAME predicate INICIO's tile counts via `contarLifecycle`. */
  tile: Tile;
  /** The `{n}D SIN VENIR` badge's raw fact (#229) — computed unconditionally by the
   *  engine (does not vanish at lapse, A9); the CONSUMER (clientes-vm.ts) applies the
   *  paid-up gate before rendering it. */
  ausente: boolean;
  /** The badge's numeral — días since `ultimaVisita`, floored to `altaIso` when never
   *  visited. Meaningless when `ausente` is false. */
  diasSinVenir: number;
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
        .select(
          "id, nombre, tel, paquete_nombre, clases_restantes, vence, email, invitacion_enviada_at, auth_user_id, created_at",
        )
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

    const ultimas: Record<string, { ultimaVisita: string | null; ultimaVisitaConsumida: string | null }> = {};
    for (const r of ultimasRes.data ?? []) {
      ultimas[r.cliente_id] = { ultimaVisita: r.ultima_visita, ultimaVisitaConsumida: r.ultima_visita_consumida };
    }

    return clientes.map((c) => {
      const base = derivarCliente(c, hoy, counts[c.id] ?? 0, paseSuelto);
      const invitacion = derivarInvitacion(c, tz);
      const visitas = ultimas[c.id] ?? { ultimaVisita: null, ultimaVisitaConsumida: null };
      const pendienteOnline = esRegistroOnlinePendiente(invitacion.estado, base.estado);
      const esPaseSueltoRow = c.paquete_nombre !== null && paseSuelto.has(c.paquete_nombre);

      // #229: the FULL engine, not the thin derivarFilaLifecycle — this row now
      // carries every fact AÚN A TIEMPO's tile + the ausente badge need
      // (tieneCuenta, both visit clocks, alta), so the tile/ausente/diasSinVenir
      // stamped here are the SAME real verdict INICIO's getRosterResumen computes,
      // never a second hand-rolled approximation.
      const clasesBase: Clases = c.clases_restantes === null ? "ilimitado" : c.clases_restantes;
      const { tile, ausente, diasSinVenir } = derivarLifecycle(
        {
          vence: c.vence ? parseDay(c.vence) : null,
          clases: clasesBase,
          esPaseSuelto: esPaseSueltoRow,
          tieneCuenta: c.auth_user_id !== null,
          pendienteOnline,
          ultimaVisitaConsumida: visitas.ultimaVisitaConsumida ? parseDay(visitas.ultimaVisitaConsumida) : null,
          ultimaVisita: visitas.ultimaVisita ? parseDay(visitas.ultimaVisita) : null,
          alta: fechaEnZona(c.created_at, tz),
        },
        hoy,
      );

      return {
        ...base,
        invitacion,
        pendienteOnline,
        esPaseSuelto: esPaseSueltoRow,
        ultimaVisita: visitas.ultimaVisita,
        ultimaVisitaConsumida: visitas.ultimaVisitaConsumida,
        altaIso: toIsoDay(fechaEnZona(c.created_at, tz)),
        tile,
        ausente,
        diasSinVenir,
      };
    });
  },
);

/** The roster headline counts plus `nuevosOnline` — the dashboard's "Nuevos
 *  registros online" tile: auth-linked (Door 2) members with no vigente package,
 *  the same population the roster filter chip surfaces (esRegistroOnlinePendiente).
 *  `porRenovar` (#228) is INICIO's POR RENOVAR tile: the SAME `esPorRenovar`/
 *  `contarLifecycle` predicate the directory's filter/count and the pase de lista
 *  badge read — never a second restatement — plus the day/clases bucket breakdown,
 *  which `contarLifecycle` guarantees sums to `porRenovar.total` (every row lands in
 *  exactly one bucket). */
export interface RosterResumenDTO extends ResumenRoster {
  nuevosOnline: number;
  porRenovar: { total: number; cubos: Record<CuboRenovar, number> };
  /** INICIO's AÚN A TIEMPO tile (#229) — the SAME `contarLifecycle`/tile predicate
   *  the directory's own AÚN A TIEMPO filter/count read, so the tile's count and
   *  `/clientes?aunATiempo=1`'s row count can never disagree (spec story 19). */
  aunATiempo: { total: number };
}

/** `vigentes`/`total`/`nuevosOnline`/`porRenovar`/`aunATiempo` for the dashboard,
 *  derived-at-read (ADR-0002, #225, #228, #229). Every row is built into the FULL
 *  lifecycle engine's per-row input (`derivarLifecycle`, not the thin
 *  `derivarFilaLifecycle` #228 used before this read carried the visit facts) and
 *  counted via `contarLifecycle` — the SAME engine the directory/pase de lista
 *  share — so none of these counts can ever disagree with those screens (never a
 *  hand-rolled `.gte()`/`.or()` restatement of the bands, the pre-#225 shape's exact
 *  "two live meanings of a band" bug). `paseSuelto` is the small catalog leg
 *  esPaseSuelto needs (a roster row's `paquete_nombre` carries no grant), fetched via
 *  the error-surfacing getPaseSueltoNombres (#225 F5). `asistencias_ultima_visita_
 *  por_cliente` (#226) is the ONE new aggregate this read adds for #229 — a grouped
 *  DB-side read run in parallel with the two legs above, never a per-row asistencias
 *  pull and never a second roster fetch (#228's perf budget, held). */
export const getRosterResumen = cache(
  async (client?: SupabaseServer): Promise<RosterResumenDTO> => {
    const supabase = client ?? (await createClient());
    const gym = await getOperatorGym(supabase);
    const tz = gym.timezone;
    const hoy = hoyEnZona(tz);

    const [{ data: clientesData }, paseSuelto, ultimasRes] = await Promise.all([
      supabase
        .from("clientes")
        // id/nombre/tel are unused by this read but ClienteFacts (derivarCliente's input
        // shape) requires them — cheap columns, no extra round trip. created_at is #229's
        // alta anchor (the ausente badge floor) — same column getClientesRoster reads.
        .select(
          "id, nombre, tel, paquete_nombre, clases_restantes, vence, email, invitacion_enviada_at, auth_user_id, created_at",
        )
        .eq("gym_id", gym.id),
      getPaseSueltoNombres(supabase),
      // #229's ONE new aggregate — the SAME asistencias_ultima_visita_por_cliente RPC
      // getClientesRoster already reads (#226): one grouped DB-side read, not a
      // full-roster asistencias pull, run alongside the two legs above.
      supabase.rpc("asistencias_ultima_visita_por_cliente", { p_gym_id: gym.id }),
    ]);

    // Fail loud (#226 F4 precedent): a swallowed error here would silently read as
    // "nobody in this gym has ever visited" — every row falls back to the alta floor
    // and AÚN A TIEMPO / the ausente math would be built on a false absence.
    if (ultimasRes.error) throw ultimasRes.error;

    const ultimas: Record<string, { ultimaVisita: string | null; ultimaVisitaConsumida: string | null }> = {};
    for (const r of ultimasRes.data ?? []) {
      ultimas[r.cliente_id] = { ultimaVisita: r.ultima_visita, ultimaVisitaConsumida: r.ultima_visita_consumida };
    }

    const clientes = clientesData ?? [];

    // Re-shape each already-derived row into the FULL lifecycle engine's per-row
    // input (#229): this read now carries every fact AÚN A TIEMPO's tile needs
    // (tieneCuenta, both visit clocks, alta) — the SAME facts getClientesRoster
    // wires (#226), so `derivarLifecycle` is called directly instead of the thin
    // `derivarFilaLifecycle` (#228), and `contarLifecycle`'s `aunATiempo.total` is
    // finally real rather than the structural zero the old thin shape produced.
    const filas: FilaLifecycle[] = clientes.map((c) => {
      const derivado = derivarCliente(c, hoy, 0, paseSuelto);
      const esPaseSueltoRow = c.paquete_nombre !== null && paseSuelto.has(c.paquete_nombre);
      const pendienteOnline = esRegistroOnlinePendiente(estadoInvitacion(c), derivado.estado);
      const visitas = ultimas[c.id] ?? { ultimaVisita: null, ultimaVisitaConsumida: null };
      const clasesBase: Clases = c.clases_restantes === null ? "ilimitado" : c.clases_restantes;

      return derivarLifecycle(
        {
          vence: c.vence ? parseDay(c.vence) : null,
          clases: clasesBase,
          esPaseSuelto: esPaseSueltoRow,
          tieneCuenta: c.auth_user_id !== null,
          pendienteOnline,
          ultimaVisitaConsumida: visitas.ultimaVisitaConsumida ? parseDay(visitas.ultimaVisitaConsumida) : null,
          ultimaVisita: visitas.ultimaVisita ? parseDay(visitas.ultimaVisita) : null,
          alta: fechaEnZona(c.created_at, tz),
        },
        hoy,
      );
    });

    const { vigentes, total, porRenovar, aunATiempo, pendienteOnline: nuevosOnline } = contarLifecycle(filas);

    return { vigentes, total, nuevosOnline, porRenovar, aunATiempo };
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

    const [asistRes, ventasRes, vecinos, perfilRes, plantillas, paquetes, cobro, paseSuelto] =
      await Promise.all([
        supabase
          .from("asistencias")
          // `class_session_id` is the visit's CONTEXT (#89): the ficha's toggle owns the
          // ACCESO LIBRE row alone, so the read has to say which rows are class visits or
          // the checked state would describe a row the toggle cannot undo. The nested
          // embed (#178) names WHICH class, so two visits on one day are told apart by
          // the class + its hour instead of by `hora` — the arrival stamp, which reads
          // the same 23:11 for two marks 17 seconds apart. A many-to-one FK embed on the
          // select that is already here: no extra round trip, no new column, no migration.
          .select(
            "fecha, hora, consumio, perdonada, class_session_id, class_session(starts_at, is_special, special_name, class_type(name))",
          )
          .eq("cliente_id", id)
          .is("deleted_at", null)
          .gte("fecha", ventanaIso)
          .order("fecha", { ascending: false }),
        supabase
          .from("ventas")
          .select("fecha, created_at, paquete_nombre, monto, metodo, clases, vigencia_tipo, vigencia_dias")
          .eq("cliente_id", id)
          // The saldo anchor is the LAST-WRITTEN sale (created_at desc, id desc — never
          // fecha, which a backdate can push into the past), matching mi_membresia (spec
          // §D3/C1). `fecha` still drives the DISPLAY (compradoDisplay / días-gauge anchor).
          .order("created_at", { ascending: false })
          .order("id", { ascending: false }),
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

    // Classes consumed since the last purchase (Part B clases-gauge denominator): a VISIT
    // count, the same unit asistencias_mes_por_cliente uses (20260729120000:764) — NOT
    // `consumio` (#173): a booked class visit is written consumio=false because
    // reservar_clase already charged the balance at booking time, so gating on consumio
    // dropped every booked visit from this counter. `perdonada` (added alongside
    // `consumio`) is excluded instead — it marks the second record of one cooldown-paired
    // arrival, never a real second visit. Counted at/after the anchor sale's WRITE INSTANT
    // (created_at, not fecha — C2/C14), not just its calendar day: a check-in earlier the
    // same day as a renewal was already spent from the pre-renewal balance, so
    // day-granularity double-counts it, and a backdated fecha would wrongly re-count gap
    // visits that already decremented the balance live. ventaDia is the gym-local calendar
    // day; ventaHora is the gym-local "HH:MM:SS" wall clock, directly string-comparable
    // against asistencias.hora (a Postgres `time`). Null `hora` (back-entry rows,
    // predating the column) are counted: no recorded time can prove they preceded it.
    const ventas = ventasRes.data ?? [];
    const ventaInstante = ventas[0]
      ? { dia: toIsoDay(fechaEnZona(ventas[0].created_at, tz)), hora: horaSegEnZona(ventas[0].created_at, tz) }
      : null;
    let attendedSincePurchase = 0;
    if (ventaInstante) {
      const { dia: ventaDia, hora: ventaHora } = ventaInstante;
      if (ventaDia >= ventanaIso) {
        // Common case: the purchase is inside the 30-day window we already fetched,
        // so count the rows in hand — no extra round trip.
        attendedSincePurchase = (asistRes.data ?? []).filter(
          (a) =>
            !a.perdonada &&
            (a.fecha > ventaDia ||
              (a.fecha === ventaDia && (a.hora === null || a.hora >= ventaHora))),
        ).length;
      } else {
        // Old purchase predating the window: a tiny exact head-count keeps the
        // gauge denominator correct without widening the historial fetch.
        const { count } = await supabase
          .from("asistencias")
          .select("id", { count: "exact", head: true })
          .eq("cliente_id", id)
          .eq("perdonada", false)
          .is("deleted_at", null)
          .or(`fecha.gt.${ventaDia},and(fecha.eq.${ventaDia},or(hora.gte.${ventaHora},hora.is.null))`);
        attendedSincePurchase = count ?? 0;
      }
    }

    const ficha = shapeFicha(
      c,
      asistRes.data ?? [],
      ventas,
      hoy,
      hoyIso,
      tz,
      plantillas,
      negocio,
      attendedSincePurchase,
      { precios: fmtPrecios(paquetes), datos_pago: fmtDatosPago(cobro) },
      paseSuelto,
    );

    return { ...ficha, hoyIso, vecinos, invitacion: derivarInvitacion(c, tz), email: c.email };
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
