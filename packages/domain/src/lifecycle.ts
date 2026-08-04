// ──────────────────────────────────────────────────────────────
// The lifecycle engine (#223, spec #222 / map #180) — ONE predicate set for
// estado, tile membership, ordering, the ausente badge, and the counts both
// CLIENTES and INICIO share. Pure, derived-at-read (ADR-0002): every fact
// below is computed from a roster row + `hoy`, nothing is stored.
//
// This is a NEW, separate engine beside derivarEstado/urgenciaCliente — it
// does not replace them (that unification is #225's job). Its shape is
// adapted from the /proto/e-ventana prototype's lifecycle.ts, amended by the
// #188 cross-examination + the owner's rulings on #187/#222:
//
//  · FECHA WINS (A2): a package that is both date-expired and class-empty —
//    every expired finite pack, once read-time forfeit collapses its balance
//    to 0 — is VENCIDO, never SIN CLASES. No tie-break: the precedence is
//    unconditional. SIN CLASES is reserved for class-empty WITH days left.
//    Mirrors the client app's own precedence (packages/data/src/server/
//    agenda-miembro.ts `getSaldoMiembro`'s `vencido`, date-only).
//  · The CLASES-arm clock is the last CONSUMING visit (`ultimaVisitaConsumida`),
//    never the last visit of any kind — a non-decrementing walk-in must not
//    reset it.
//  · AÚN A TIEMPO is clocked from EXPIRY ONLY (days 1-15 since the DATE
//    lapsed) and excludes one-off passes + members with an app account (the
//    client app already nudges those at the moment of lapse).
//  · POR RENOVAR's "live package" gate is `estado !== "vencido"` — WEAKER
//    than the proto's "activa" — so a SIN CLASES row (days left, 0 clases)
//    always qualifies via the `clases <= RENOVACION_CLASES` arm (owner
//    stories 6/7: the tile's own breakdown must carry a clases bucket so it
//    always sums to the headline).
//  · pendienteOnline (and any no-package row) is a first-class `estado`,
//    never folded into "vencido" and never sorted below the graveyard (S4).
//  · The `ausente` badge is computed unconditionally (never gated on
//    estado, so it does not vanish the day a package lapses) and floors a
//    null last-visit on `alta` instead of hiding null-blind (S9).
//  · The membership-vs-drop-in predicate (`esPaseSuelto`) blocks the CLASES
//    axis entirely, not just AÚN A TIEMPO's exclusion: a spent one-off pass
//    (0 clases is its NORMAL end state after a single visit) must never read
//    SIN CLASES or land in POR RENOVAR via the clases arm — that is exactly
//    the "22 vs. 4 real queue" bug (#184: 5 of 8 old tile-2 rows were spent
//    Clase Individual passes, never members) this engine exists to kill. A
//    one-off pass can still appear in POR RENOVAR via the DÍAS arm (its own
//    validity window closing is a real fact); only the classes signal is inert.
//
// Amended after an opus review of the first cut (#223 findings 1-6):
//  · pendienteOnline is NOT synonymous with `vence: null`. The real producer
//    (packages/data/src/server/derive.ts `esRegistroOnlinePendiente`) marks
//    it whenever `invitacion === "cuenta_activa" && estado === "sin_clases"`
//    — and the OLD estado's "sin_clases" covers both "no package" AND
//    "expired by date". A lapsed online registrant therefore has
//    `pendienteOnline: true` with a real PAST `vence`. Ordering reads
//    `fila.pendienteOnline` directly, never inferring it from `vence`.
//  · The urgencia floor (expired is never crítico) and the `vigentes`/`total`
//    header-ratio counts now ship in this engine's output, so #225's seven
//    consumers have something to read instead of re-deriving them.
//  · The actionable/current tiers sort by the BINDING AXIS (the floored
//    urgencia nivel), not raw días — a SIN CLASES row with days to spare is
//    still unable to train today and must not be stranded behind it.
//
// Amended after an opus review of #227 (F1): the "lapsed online registrant
// still has pendienteOnline: true" case described above is GONE — the
// producer was narrowed to `invitacion === "cuenta_activa" && estado ===
// "sin_paquete"` (a member who has never bought a package). That broader
// gate had promoted every account-holder whose package merely lapsed into
// this engine's group-0 "actionable" tier (claveOrden -1, ahead of even a
// día-0 renewal) — at a roster where every member has an app account, the
// entire dead roster topped the list, the exact defect spec #222 opens
// with. A lapsed account-holder is now plain `vencido` (group 2; the
// client app already nudges them at lapse — the same reason AÚN A TIEMPO
// excludes account-holders), so `fila.pendienteOnline === true` now always
// implies `fila.vence === null` too — it is now synonymous with "no
// package ever existed," not merely correlated with it.
// ──────────────────────────────────────────────────────────────

import { derivarEstado, diasRestantes, estaVencido, urgenciaCliente } from "./rules";
import type { Clases, EstadoCliente, NivelUrgencia, Saldo } from "./types";

/** The pre-expiry window ("por renovar"). Owner ruling 2026-08-02: 10 días —
 *  ERGONOMIC, chosen for legibility, NOT a measured value (#185 Q4 measured
 *  renewals at forge within ±2 days of vence, median 0; #182 §7 explicitly
 *  warns against defending this as measured). Its future home as a
 *  per-tenant setting is named, not built (out of scope, #222). This is the
 *  ONE predicate "por renovar" may mean anywhere in the product. */
export const RENOVACION_DIAS = 10;
/** Fitco's second `Próximas Renovaciones` arm: "1 session left". */
export const RENOVACION_CLASES = 1;
/** AÚN A TIEMPO's post-expiry window (Fitco `Clientes por Recuperar`). Day
 *  16 is the hard horizon — «Después de 16 días, los clientes ya no
 *  aparecen» (#181 D6). */
export const RECUPERACION_DIAS = 15;
/** The absence badge's clock (TeamUp `Slipping Away`, corroborated by
 *  Wodify's 15-day "without sign-ins" filter, #181 D5). */
export const AUSENTE_DIAS = 15;

/** Which axis binds a non-vigente package: the date, or the class balance.
 *  null while vigente (nothing has ended). Fecha wins when both are true. */
export type Eje = "fecha" | "clases";

/** A package's derived lifecycle — never a verdict on the PERSON (no
 *  Activo/Inactivo anywhere in this engine). `sin_paquete` covers both a
 *  same-day sign-up and a pendienteOnline row: there is no package to be
 *  vigente/vencido/sin_clases ABOUT. Literally `EstadoCliente` (types.ts) — the
 *  #225 unification made that the ONE estado type; this alias keeps this file's
 *  internal vocabulary (a package's state, not a "cliente" field) readable. */
export type EstadoPaquete = EstadoCliente;

/** INICIO's two bounded tiles. null past day 16, or when nothing binds. */
export type Tile = "por_renovar" | "aun_a_tiempo" | null;

/** A package's class GRANT as sold — 1..30, or null for ilimitado. Mirrors
 *  `packages/data/server/paquetes.ts`'s `PaqueteDTO.clases` exactly: the
 *  catalog's fixed archetype, NEVER a roster row's current remaining
 *  balance (which drains as the member trains and legitimately passes
 *  through 1 on its way to 0 for an 8-clase membership). */
export type ClaseGrant = number | null;

/** The membership-vs-drop-in predicate (#222 Implementation Decisions, #223
 *  finding 2): classify a package from its own CATALOG FACT, never a
 *  `paquete_nombre` string match in data/UI. A grant of exactly 1 class is a
 *  single-session drop-in — `packages/data/src/server/marketing.ts:72-73`
 *  already encodes this identical rule for the Precios CTA tiering ("1 for
 *  a single-session drop-in"), so this is the SAME structural fact, given a
 *  name in the domain vocabulary. A finite grant > 1, or ilimitado (null),
 *  is a membership. Produces `FilaRosterLifecycle.esPaseSuelto`. */
export function esPaseSuelto(claseGrant: ClaseGrant): boolean {
  return claseGrant === 1;
}

/** Build the pase-suelto NAME Set from a package catalog — the ONE place this Set is
 *  assembled (#225 F5; was triplicated across packages/data/src/server/clientes.ts ×2
 *  and export/rows.ts). Lives here, not in packages/data/src/server/derive.ts, to
 *  avoid a circular import (derive.ts → plantilla-ctx.ts → paquetes.ts would close a
 *  loop back to derive.ts if paquetes.ts's error-surfacing reader depended on it —
 *  see paquetes.ts's `getPaseSueltoNombres`). Pure; callers own surfacing a catalog
 *  READ failure loudly — a swallowed error here would silently misclassify every
 *  drop-in package as a membership across estado/vigentes/POR RENOVAR/the export. */
export function paseSueltoNombres(paquetes: { nombre: string; clases: ClaseGrant }[]): ReadonlySet<string> {
  return new Set(paquetes.filter((p) => esPaseSuelto(p.clases)).map((p) => p.nombre));
}

/** POR RENOVAR's breakdown buckets. Day buckets (Connect Gym's observed
 *  today/tomorrow/3d/5d shape) PLUS `clases` — so the buckets always sum to
 *  the tile's headline, including members whose classes (not days) bind. */
export type CuboRenovar = "hoy" | "manana" | "dosATres" | "cuatroACinco" | "seisOMas" | "clases";

/** One roster row's facts, as the lifecycle engine needs them. `vence: null`
 *  means no package exists at all (a same-day sign-up, or a pendienteOnline
 *  row) — distinct from an expired package, which has a real (past) vence. */
export interface FilaRosterLifecycle {
  /** Package validity end date, or null when there is no package. */
  vence: Date | null;
  /** Classes remaining. Raw (pre- or post-forfeit both work: FECHA WINS makes
   *  the distinction moot for `estado` — see file header). Ignored when
   *  `vence` is null. */
  clases: Clases;
  /** A spent one-off pass, never a renewal target — the membership-vs-drop-in
   *  predicate the domain vocabulary now carries (#222 Implementation
   *  Decisions). Ignored when `vence` is null. Produce via `esPaseSuelto`
   *  (below) from the package's own catalog grant — never a `paquete_nombre`
   *  string match in data/UI. */
  esPaseSuelto: boolean;
  /** Auth-linked app account (Door 2) — the client app already nudges these
   *  at the moment of lapse, so AÚN A TIEMPO excludes them. */
  tieneCuenta: boolean;
  /** Online-registered (Door 2) member who has NEVER bought a package — a
   *  first-class state (never "fuera de alcance"). The real producer
   *  (packages/data/server/derive.ts `esRegistroOnlinePendiente`) marks this
   *  whenever `estado === "sin_paquete"` (#227 F1 — narrowed from any
   *  non-vigente estado, which had wrongly promoted every lapsed
   *  account-holder into this flag too), so `pendienteOnline: true` now
   *  ALWAYS implies `vence: null`. Reconciled with AÚN A TIEMPO twice over:
   *  that tile requires `!tieneCuenta` (a pendienteOnline row always carries
   *  an account), AND its `estado === "vencido"` gate can never be true for a
   *  sin_paquete row in the first place. Ordering reads this flag directly. */
  pendienteOnline: boolean;
  /** Date of the last CONSUMING visit (one that decremented a class), or null
   *  if there has never been one. The clases-arm clock — a later NON-consuming
   *  walk-in must not advance this. */
  ultimaVisitaConsumida: Date | null;
  /** Date of the last visit of ANY kind (consuming or not), or null if the
   *  client has never attended. Feeds `ausente`. */
  ultimaVisita: Date | null;
  /** The client's alta (signup) date — the floor for a null `ultimaVisita`
   *  ("bought, never came" vs. "just signed up today"). */
  alta: Date;
}

/** One roster row's derived lifecycle facts. */
export interface FilaLifecycle {
  fila: FilaRosterLifecycle;
  estado: EstadoPaquete;
  eje: Eje | null;
  /** Whole days remaining until `vence` (negative once past), or null when
   *  there is no package (`sin_paquete`). */
  dias: number | null;
  /** Whole days since the binding axis ended, or null while vigente/sin_paquete,
   *  or when the clases axis has no CONSUMING-visit anchor to clock from
   *  (never silently treated as 0 or "out of range" — see derivarTile). */
  diasDesdeFin: number | null;
  tile: Tile;
  /** The urgencia FLOOR (#223 finding 3): expired is never crítico — see
   *  `nivelUrgenciaLifecycle`. `sin_paquete` also floors to "ok" (nothing to
   *  be urgent about — there is no package). #225 points the seven existing
   *  consumers (urgenciaCliente's raw callers) at this floored number. */
  urgencia: NivelUrgencia;
  ausente: boolean;
}

/** The counts both CLIENTES and INICIO share — the single home for "how many
 *  are por renovar / aún a tiempo", so the two screens can never disagree. */
export interface ConteosLifecycle {
  /** `estado === "vigente"` — the header ratio's numerator (story 3/19: "N
   *  con paquete vigente de M", never a second inline filter count). */
  vigentes: number;
  /** The whole roster — the header ratio's "de M" denominator. */
  total: number;
  porRenovar: { total: number; cubos: Record<CuboRenovar, number> };
  aunATiempo: { total: number };
  pendienteOnline: number;
}

function clasesNum(c: Clases): number {
  return c === "ilimitado" ? Infinity : c;
}

/** Whether the CLASES axis binds at the POR RENOVAR threshold — false for a
 *  one-off pass (see file header: the classes signal is inert for a
 *  membership-vs-drop-in row; a spent single-use pass is not "running out"
 *  of anything). Primitives, not `FilaRosterLifecycle` (#225 F4), so
 *  `esPorRenovar` — the single-row predicate exposed to consumers with no
 *  full roster context — can share it too. */
function esClasesBoundParaRenovar(esPaseSuelto: boolean, clases: Clases): boolean {
  return !esPaseSuelto && clasesNum(clases) <= RENOVACION_CLASES;
}

/** Whole days elapsed from `fecha` to `hoy` (positive once `fecha` is in the
 *  past) — `diasRestantes` run in reverse, at the same local-midnight
 *  granularity, so the two never drift apart. */
function diasDesde(fecha: Date, hoy: Date): number {
  return diasRestantes(hoy, fecha);
}

/** The urgencia FLOOR (#223 finding 3, prerequisite of #222's engine
 *  unification): expired is never crítico. `urgenciaCliente`'s raw días/
 *  clases thresholds paint every VENCIDO row the same alarming red the
 *  problem statement measured (19 of 30 rows red, 1 actionable) — once a
 *  package has actually lapsed there is nothing left to "run out of", so
 *  the signal floors to "ok". Reuses `urgenciaCliente`'s dimension logic
 *  UNCHANGED (this ticket only adds).
 *
 *  Second floor arm (#225 F3): `sin_paquete` also floors to "ok" — a
 *  package-less client (a same-day sign-up, or a pendienteOnline row) has
 *  nothing to run out of either, and must never look like old churn (story
 *  13). `derivarLifecycle` never reaches this call for a sin_paquete row
 *  (its early return already hardcodes urgencia "ok" — see below), but the
 *  OTHER #225 consumers call this with only a bare Saldo (no `vence`, so no
 *  way to self-detect "no package") — `estado` is optional so those callers
 *  can pass it and get the same floor. Omitting it (the 1-arg form) is only
 *  safe when the caller already knows the row has a package. */
export function nivelUrgenciaLifecycle(saldo: Saldo, estado?: EstadoPaquete): NivelUrgencia {
  if (estado === "sin_paquete") return "ok";
  return estaVencido(saldo.dias) ? "ok" : urgenciaCliente(saldo).nivel;
}

/** Whether a package is POR RENOVAR (#225 F4) — the SAME gate `derivarTile`
 *  uses below, exposed for consumers that ask about ONE row without the full
 *  roster context `derivarLifecycle` needs (the pase de lista badge, the
 *  directory's filter/count — pre-#225-F4 those re-coined their OWN "por
 *  renovar" via the urgencia gradient, a second live meaning of the phrase).
 *  A live package (not vencido, not sin_paquete) within RENOVACION_DIAS of
 *  its date, or down to RENOVACION_CLASES classes (paseSuelto-exempt on the
 *  clases arm — see esClasesBoundParaRenovar). */
export function esPorRenovar(
  estado: EstadoPaquete,
  dias: number,
  clases: Clases,
  esPaseSuelto: boolean,
): boolean {
  if (estado === "vencido" || estado === "sin_paquete") return false;
  return dias <= RENOVACION_DIAS || esClasesBoundParaRenovar(esPaseSuelto, clases);
}

function derivarTile(fila: FilaRosterLifecycle, dias: number, estado: EstadoPaquete): Tile {
  // POR RENOVAR: a "live" package — NOT vencido; SIN CLASES still counts
  // (owner stories 6/7) — within RENOVACION_DIAS of its date, or down to
  // RENOVACION_CLASES classes (never via a one-off pass's spent clases — see
  // esClasesBoundParaRenovar). A SIN CLASES row (clases <= 0, not a one-off
  // pass) always satisfies the clases arm, so it is always in this tile.
  if (esPorRenovar(estado, dias, fila.clases, fila.esPaseSuelto)) {
    return "por_renovar";
  }
  if (estado === "vencido") {
    // dias < 0 whenever estado is "vencido" (estaVencido), so -dias is
    // always a definite, positive number here — no null to guard against
    // (#223 finding 6: a `diasDesdeFin !== null` check used to sit here,
    // permanently true and therefore dead).
    const diasDesdeExpiry = -dias;
    // AÚN A TIEMPO: clocked from EXPIRY ONLY (owner ruling, #222) — days
    // 1..15 since the DATE lapsed. Excludes one-off passes (never members)
    // and members with an app account (the client app already nudges them).
    if (
      !fila.esPaseSuelto &&
      !fila.tieneCuenta &&
      diasDesdeExpiry >= 1 &&
      diasDesdeExpiry <= RECUPERACION_DIAS
    ) {
      return "aun_a_tiempo";
    }
  }
  return null;
}

/** Badge floors (S9/A9): computed UNCONDITIONALLY — never gated on estado,
 *  so the fact does not vanish the day a package lapses. A null
 *  `ultimaVisita` ("bought, never came") floors on `alta` instead of hiding
 *  null-blind, but a fresh alta (a same-day sign-up) correctly reads false.
 *  Consumers decide whether to SURFACE this only for paid-up members
 *  (#222) — the engine always computes the fact. */
function calcAusente(fila: FilaRosterLifecycle, hoy: Date): boolean {
  if (fila.ultimaVisita !== null) return diasDesde(fila.ultimaVisita, hoy) >= AUSENTE_DIAS;
  return diasDesde(fila.alta, hoy) >= AUSENTE_DIAS;
}

/** The lifecycle engine's per-row half: given one roster row and `hoy`,
 *  derive its estado, eje, tile, urgencia, and ausente fact. Pure — no I/O,
 *  no stored state (ADR-0002). */
export function derivarLifecycle(fila: FilaRosterLifecycle, hoy: Date): FilaLifecycle {
  const ausente = calcAusente(fila, hoy);

  if (fila.vence === null) {
    // sin_paquete: nothing to be urgent about — there is no package.
    return {
      fila,
      estado: "sin_paquete",
      eje: null,
      dias: null,
      diasDesdeFin: null,
      tile: null,
      urgencia: "ok",
      ausente,
    };
  }

  const dias = diasRestantes(fila.vence, hoy);
  // FECHA WINS (A2), the pase-suelto classes exemption, and the vigente/vencido/
  // sin_clases partition are ALL derivarEstado's job (rules.ts) — the single
  // predicate both this engine and every #225 consumer (derivarCliente, the
  // resumen, the export) read, never a second inline restatement (#223 finding,
  // closed by #225).
  const estado: EstadoPaquete = derivarEstado({ clases: fila.clases, dias }, fila.esPaseSuelto);
  const eje: Eje | null = estado === "vigente" ? null : estado === "vencido" ? "fecha" : "clases";

  const diasDesdeFin: number | null =
    eje === "fecha"
      ? -dias
      : eje === "clases" && fila.ultimaVisitaConsumida !== null
        ? diasDesde(fila.ultimaVisitaConsumida, hoy)
        : null;

  const tile = derivarTile(fila, dias, estado);
  // A one-off pass's spent clases are inert for urgencia too (same principle
  // as esClasesBoundParaRenovar/sinClases above) — "ilimitado" blinds the
  // clases dimension so only días can drive a paseSuelto row's urgencia.
  const urgencia = nivelUrgenciaLifecycle({
    clases: fila.esPaseSuelto ? "ilimitado" : fila.clases,
    dias,
  });

  return { fila, estado, eje, dias, diasDesdeFin, tile, urgencia, ausente };
}

/** Build a FULLY-CONSISTENT `FilaLifecycle` from an already-derived roster row's
 *  estado/días/clases — for callers that have run a row through `derivarCliente`
 *  (packages/data) but do NOT have the richer `FilaRosterLifecycle` input
 *  `derivarLifecycle` needs (`vence` as a Date, `tieneCuenta`, visit facts — the
 *  RPC #222 sequences after epic #203). Two call sites need exactly this shape
 *  today — `getRosterResumen` (INICIO's POR RENOVAR tile, #228) and the CLIENTES
 *  view-model (`clientes-vm.ts`, #227) — and #228's opus review (finding 4) caught
 *  a hand-rolled copy setting `eje`/`diasDesdeFin`/`urgencia` to placeholder values
 *  that VIOLATE this engine's own invariants (`ordenarLifecycle`'s
 *  `diasDesdeVencido` asserts a vencido row's `diasDesdeFin` is never null). This
 *  is the ONE constructor both call sites use instead, so neither can drift from
 *  the other or from `derivarLifecycle`'s own derivation.
 *
 *  `eje`/`diasDesdeFin` mirror `derivarLifecycle`'s exact derivation (FECHA WINS,
 *  `diasDesdeFin = -dias` on vencido) minus the clases-arm anchor (no
 *  `ultimaVisitaConsumida` in this input, so a sin_clases row's `diasDesdeFin`
 *  stays honestly null rather than a fabricated 0 — never null-silently-out-of-
 *  range). `urgencia` reuses the SAME pase-suelto-blind `nivelUrgenciaLifecycle`
 *  call `derivarLifecycle` makes. `tile` only ever resolves to "por_renovar" or
 *  null — AÚN A TIEMPO needs `tieneCuenta`/`ultimaVisitaConsumida`, absent here;
 *  neither call site renders that tile from this shape. `ausente` is always
 *  false for the same reason (no visit facts to compute it from) — matching both
 *  callers' prior behavior. */
export function derivarFilaLifecycle(input: {
  estado: EstadoPaquete;
  /** Raw días from `derivarCliente` — 0 for a sin_paquete row (that function never
   *  returns null), never dereferenced when `estado === "sin_paquete"` (esPorRenovar/
   *  nivelUrgenciaLifecycle both short-circuit on that estado before touching it). */
  dias: number;
  clases: Clases;
  esPaseSuelto: boolean;
  pendienteOnline: boolean;
}): FilaLifecycle {
  const { estado, dias, clases, esPaseSuelto, pendienteOnline } = input;

  // Mirrors derivarLifecycle's own eje ternary, widened by one arm: that function
  // only ever reaches its ternary once `fila.vence !== null` has ruled out
  // sin_paquete (its early return sets eje null directly) — this constructor's
  // `estado` input can BE sin_paquete, so the widened form folds that case to
  // null explicitly instead of mis-reading it as "clases" (the bug F4 caught).
  const eje: Eje | null =
    estado === "vencido" ? "fecha" : estado === "sin_clases" ? "clases" : null;
  const diasDesdeFin = eje === "fecha" ? -dias : null;

  // A one-off pass's spent clases are inert for urgencia (same blind
  // derivarLifecycle applies) — "ilimitado" so only días can drive it.
  const saldo: Saldo = { clases: esPaseSuelto ? "ilimitado" : clases, dias };

  const fila: FilaRosterLifecycle = {
    vence: null, // unread by ordenarLifecycle/contarLifecycle — see their bodies
    clases,
    esPaseSuelto,
    tieneCuenta: false,
    pendienteOnline,
    ultimaVisitaConsumida: null,
    ultimaVisita: null,
    alta: new Date(0),
  };

  return {
    fila,
    estado,
    eje,
    dias: estado === "sin_paquete" ? null : dias, // mirrors derivarLifecycle's early return
    diasDesdeFin,
    tile: esPorRenovar(estado, dias, clases, esPaseSuelto) ? "por_renovar" : null,
    urgencia: nivelUrgenciaLifecycle(saldo, estado),
    ausente: false,
  };
}

// ── Ordering (the ruled ordering, #222): actionable → current → expired
//    (most-recently-expired first). Three keys over ONE flat list — no
//    sections, no fold (#181 D1: the vendors with no declared "gone" lever
//    all keep one list where the label simply flips). ────────────────────

/** Non-null accessor for a VENCIDO row's diasDesdeFin. `estado === "vencido"`
 *  always sets `eje = "fecha"` and `diasDesdeFin = -dias`, a definite number
 *  (derivarLifecycle) — never null. Asserted, not defaulted: a silent
 *  `?? Infinity` here would make TWO such rows compare `Infinity - Infinity`
 *  = NaN, corrupting `toSorted`'s comparator (#223 finding 6). */
function diasDesdeVencido(f: FilaLifecycle): number {
  if (f.diasDesdeFin === null) {
    throw new Error("lifecycle invariant violated: a vencido row has no diasDesdeFin");
  }
  return f.diasDesdeFin;
}

const NIVEL_RANGO: Record<NivelUrgencia, number> = { critico: 0, urgente: 1, pronto: 2, ok: 3 };

function grupoOrden(f: FilaLifecycle): 0 | 1 | 2 {
  // pendienteOnline is read DIRECTLY (finding 1) rather than inferred from
  // sin_paquete — belt-and-suspenders: the real producer (#227 F1) now only
  // ever sets it alongside estado "sin_paquete", but this function takes
  // whatever a caller hands it, so the explicit OR keeps a first-class
  // pendienteOnline row in group 0 even if a future/test producer diverges.
  if (f.fila.pendienteOnline || f.estado === "sin_paquete" || f.tile === "por_renovar") return 0;
  if (f.estado === "vencido") return 2;
  return 1; // vigente, outside the tile (sin_clases is always in por_renovar — see invariant test)
}

function claveOrden(f: FilaLifecycle): number {
  if (f.fila.pendienteOnline || f.estado === "sin_paquete") return -1; // ahead of even a día-0 renewal
  if (f.estado === "vencido") return diasDesdeVencido(f); // most-recently-expired first
  // Actionable/current tiers: sort by the BINDING AXIS (the floored urgencia
  // nivel), not raw días (#223 finding 5) — a SIN CLASES row is critico
  // regardless of how many días remain, and raw-día sorting stranded it
  // behind a merely-urgente días-bound row.
  return NIVEL_RANGO[f.urgencia] * 1000 + (f.dias ?? 0);
}

/** The roster-level half: order derived rows actionable → current → expired
 *  (most-recently-expired first, #222). Ordering only — never a fold, a tab,
 *  or a relocation. */
export function ordenarLifecycle(filas: FilaLifecycle[]): FilaLifecycle[] {
  return filas.toSorted((a, b) => grupoOrden(a) - grupoOrden(b) || claveOrden(a) - claveOrden(b));
}

// ── Counts (the shared counts, #222) ──────────────────────────────────────

/** Connect Gym's observed today/tomorrow/3d/5d shape, plus a final catch-all.
 *  TOTAL by construction (#223 finding 6c): every input lands in a real
 *  bucket, so the caller never needs an `undefined`/"drop the row" branch —
 *  the prior `Array.find` + `if (cubo)` could silently drop a row from the
 *  breakdown, defeating the very guarantee (buckets sum to the headline)
 *  this function exists to hold. `seisOMas` is both the named 6-10 band AND
 *  the safety net for anything >= 6, so the buckets-sum-to-total invariant
 *  holds even if a future caller feeds a día outside [0, RENOVACION_DIAS]. */
function cuboDias(d: number): CuboRenovar {
  if (d === 0) return "hoy";
  if (d === 1) return "manana";
  if (d <= 3) return "dosATres";
  if (d <= 5) return "cuatroACinco";
  return "seisOMas";
}

/** Display labels for POR RENOVAR's buckets, keyed by the SAME `CuboRenovar`
 *  union `cuboDias` assigns into — an exhaustive `Record`, so adding a bucket
 *  member fails THIS compile (a missing key) instead of silently vanishing
 *  from a consumer's hand-rolled array that has no such exhaustiveness check
 *  (#228 opus review F2/F3: INICIO's tile had hardcoded "2–3 D"/"4–5 D" in
 *  TSX, restating `cuboDias`'s boundaries with no compiler tie back to them —
 *  retuning the engine would silently make the labels lie). The day-bucket
 *  labels are worded off `RENOVACION_DIAS` directly, so retuning that
 *  constant retunes the "6–N D" label with it. */
export const CUBO_LABEL: Record<CuboRenovar, string> = {
  hoy: "HOY",
  manana: "MAÑANA",
  dosATres: "2–3 D",
  cuatroACinco: "4–5 D",
  seisOMas: `6–${RENOVACION_DIAS} D`,
  clases: "CLASES",
};

/** Render order for the POR RENOVAR bucket grid — chronological day buckets,
 *  clases last. Mechanically derived from `CUBO_LABEL`'s own key order (object
 *  key iteration is insertion order for non-numeric string keys) rather than a
 *  second hand-maintained array, so there is exactly ONE place to edit when a
 *  bucket is added. */
export const CUBO_ORDEN: readonly CuboRenovar[] = Object.keys(CUBO_LABEL) as CuboRenovar[];

/** The roster-level counts both CLIENTES and INICIO share. POR RENOVAR's
 *  `cubos` always sum to `total`: every row lands in EXACTLY one bucket —
 *  `clases` when `clases <= RENOVACION_CLASES` (the binding-axis arm, owner
 *  stories 6/7), else the one day-bucket `cuboDias` assigns (guaranteed
 *  in [0, RENOVACION_DIAS] whenever it isn't clases-bound, since estado !==
 *  "vencido" is the tile's other gate; `cuboDias` is total regardless). */
export function contarLifecycle(filas: FilaLifecycle[]): ConteosLifecycle {
  const renovar = filas.filter((f) => f.tile === "por_renovar");
  const cubos: Record<CuboRenovar, number> = {
    hoy: 0,
    manana: 0,
    dosATres: 0,
    cuatroACinco: 0,
    seisOMas: 0,
    clases: 0,
  };

  for (const f of renovar) {
    if (esClasesBoundParaRenovar(f.fila.esPaseSuelto, f.fila.clases)) {
      cubos.clases += 1;
      continue;
    }
    // A "por_renovar" row is never sin_paquete (see derivarLifecycle's early
    // return), so `dias` is guaranteed non-null here.
    cubos[cuboDias(f.dias ?? 0)] += 1;
  }

  return {
    vigentes: filas.filter((f) => f.estado === "vigente").length,
    total: filas.length,
    porRenovar: { total: renovar.length, cubos },
    aunATiempo: { total: filas.filter((f) => f.tile === "aun_a_tiempo").length },
    pendienteOnline: filas.filter((f) => f.fila.pendienteOnline).length,
  };
}
