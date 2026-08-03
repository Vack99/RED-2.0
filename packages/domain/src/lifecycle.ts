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
// ──────────────────────────────────────────────────────────────

import { diasRestantes, estaVencido } from "./rules";
import type { Clases } from "./types";

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
 *  vigente/vencido/sin_clases ABOUT. */
export type EstadoPaquete = "vigente" | "vencido" | "sin_clases" | "sin_paquete";

/** INICIO's two bounded tiles. null past day 16, or when nothing binds. */
export type Tile = "por_renovar" | "aun_a_tiempo" | null;

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
   *  Decisions). Ignored when `vence` is null. */
  esPaseSuelto: boolean;
  /** Auth-linked app account (Door 2) — the client app already nudges these
   *  at the moment of lapse, so AÚN A TIEMPO excludes them. */
  tieneCuenta: boolean;
  /** Online-registered (Door 2), no active package — a first-class state
   *  (never "fuera de alcance"). Reconciled with AÚN A TIEMPO by construction:
   *  a pendienteOnline row always has `vence: null`, so it never reaches the
   *  vencido branch AÚN A TIEMPO requires. */
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
  ausente: boolean;
}

/** The counts both CLIENTES and INICIO share — the single home for "how many
 *  are por renovar / aún a tiempo", so the two screens can never disagree. */
export interface ConteosLifecycle {
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
 *  of anything). */
function esClasesBoundParaRenovar(fila: FilaRosterLifecycle): boolean {
  return !fila.esPaseSuelto && clasesNum(fila.clases) <= RENOVACION_CLASES;
}

/** Whole days elapsed from `fecha` to `hoy` (positive once `fecha` is in the
 *  past) — `diasRestantes` run in reverse, at the same local-midnight
 *  granularity, so the two never drift apart. */
function diasDesde(fecha: Date, hoy: Date): number {
  return diasRestantes(hoy, fecha);
}

function derivarTile(
  fila: FilaRosterLifecycle,
  dias: number,
  estado: EstadoPaquete,
  diasDesdeFin: number | null,
): Tile {
  // POR RENOVAR: a "live" package — NOT vencido; SIN CLASES still counts
  // (owner stories 6/7) — within RENOVACION_DIAS of its date, or down to
  // RENOVACION_CLASES classes (never via a one-off pass's spent clases — see
  // esClasesBoundParaRenovar). A SIN CLASES row (clases <= 0, not a one-off
  // pass) always satisfies the clases arm, so it is always in this tile.
  if (estado !== "vencido" && (dias <= RENOVACION_DIAS || esClasesBoundParaRenovar(fila))) {
    return "por_renovar";
  }
  // AÚN A TIEMPO: clocked from EXPIRY ONLY (owner ruling, #222) — days 1..15
  // since the DATE lapsed. Excludes one-off passes (never members) and
  // members with an app account (the client app already nudges them).
  if (
    estado === "vencido" &&
    !fila.esPaseSuelto &&
    !fila.tieneCuenta &&
    diasDesdeFin !== null &&
    diasDesdeFin >= 1 &&
    diasDesdeFin <= RECUPERACION_DIAS
  ) {
    return "aun_a_tiempo";
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
 *  derive its estado, eje, tile, and ausente fact. Pure — no I/O, no stored
 *  state (ADR-0002). */
export function derivarLifecycle(fila: FilaRosterLifecycle, hoy: Date): FilaLifecycle {
  const ausente = calcAusente(fila, hoy);

  if (fila.vence === null) {
    return { fila, estado: "sin_paquete", eje: null, dias: null, diasDesdeFin: null, tile: null, ausente };
  }

  const dias = diasRestantes(fila.vence, hoy);
  const vencioFecha = estaVencido(dias);
  // A one-off pass reading 0 clases is its NORMAL end state after one visit,
  // not a lapse — see file header. It never trips SIN CLASES.
  const sinClases = !fila.esPaseSuelto && clasesNum(fila.clases) <= 0;

  // FECHA WINS (A2) — unconditional, no tie-break: see file header.
  const estado: EstadoPaquete = vencioFecha ? "vencido" : sinClases ? "sin_clases" : "vigente";
  const eje: Eje | null = estado === "vigente" ? null : estado === "vencido" ? "fecha" : "clases";

  const diasDesdeFin: number | null =
    eje === "fecha"
      ? -dias
      : eje === "clases" && fila.ultimaVisitaConsumida !== null
        ? diasDesde(fila.ultimaVisitaConsumida, hoy)
        : null;

  const tile = derivarTile(fila, dias, estado, diasDesdeFin);

  return { fila, estado, eje, dias, diasDesdeFin, tile, ausente };
}

// ── Ordering (the ruled ordering, #222): actionable → current → expired
//    (most-recently-expired first). Three keys over ONE flat list — no
//    sections, no fold (#181 D1: the vendors with no declared "gone" lever
//    all keep one list where the label simply flips). ────────────────────

function grupoOrden(f: FilaLifecycle): 0 | 1 | 2 {
  // sin_paquete (a same-day sign-up or a pendienteOnline row) is fresh
  // business, not history — it is never sorted below the expired (S4).
  if (f.estado === "sin_paquete" || f.tile === "por_renovar") return 0;
  if (f.estado === "vencido") return 2;
  return 1; // vigente, outside the tile (sin_clases is always in por_renovar — see invariant test)
}

function claveOrden(f: FilaLifecycle): number {
  if (f.estado === "sin_paquete") return -1; // ahead of even a día-0 renewal
  if (f.estado === "vencido") return f.diasDesdeFin ?? Infinity; // most-recently-expired first
  return f.dias ?? 0; // soonest-due first, within both the actionable and current tiers
}

/** The roster-level half: order derived rows actionable → current → expired
 *  (most-recently-expired first, #222). Ordering only — never a fold, a tab,
 *  or a relocation. */
export function ordenarLifecycle(filas: FilaLifecycle[]): FilaLifecycle[] {
  return filas.toSorted((a, b) => grupoOrden(a) - grupoOrden(b) || claveOrden(a) - claveOrden(b));
}

// ── Counts (the shared counts, #222) ──────────────────────────────────────

const CUBOS_DIAS: { cubo: CuboRenovar; test: (d: number) => boolean }[] = [
  { cubo: "hoy", test: (d) => d === 0 },
  { cubo: "manana", test: (d) => d === 1 },
  { cubo: "dosATres", test: (d) => d >= 2 && d <= 3 },
  { cubo: "cuatroACinco", test: (d) => d >= 4 && d <= 5 },
  { cubo: "seisOMas", test: (d) => d >= 6 && d <= RENOVACION_DIAS },
];

/** The roster-level counts both CLIENTES and INICIO share. POR RENOVAR's
 *  `cubos` always sum to `total`: every row lands in EXACTLY one bucket —
 *  `clases` when `clases <= RENOVACION_CLASES` (the binding-axis arm, owner
 *  stories 6/7), else the one day-bucket its `dias` falls into (guaranteed
 *  in [0, RENOVACION_DIAS] whenever it isn't clases-bound, since estado !==
 *  "vencido" is the tile's other gate). */
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
    if (esClasesBoundParaRenovar(f.fila)) {
      cubos.clases += 1;
      continue;
    }
    const cubo = CUBOS_DIAS.find((c) => c.test(f.dias ?? 0));
    if (cubo) cubos[cubo.cubo] += 1;
  }

  return {
    porRenovar: { total: renovar.length, cubos },
    aunATiempo: { total: filas.filter((f) => f.tile === "aun_a_tiempo").length },
    pendienteOnline: filas.filter((f) => f.fila.pendienteOnline).length,
  };
}
