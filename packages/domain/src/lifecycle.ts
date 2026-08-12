// ──────────────────────────────────────────────────────────────
// El ciclo de vida del paquete — UNA FILA → UN VEREDICTO (#223, spec #222 /
// map #180). One entry point, `derivarVeredicto`, takes a cliente row's STORED
// facts plus the read's loop-invariant contexto and returns the WHOLE derived
// verdict: estado, eje, urgencia, tile, por renovar + cubo, fuera de alcance,
// pendienteOnline, días/clases restantes and ausencia. Pure, derived-at-read
// (ADR-0002): nothing below is stored.
//
// The module is DEEP on purpose. Before this, every surface (los dos reads del
// roster, la ficha, el respaldo, el pase de lista) assembled the engine's input
// itself — 8 facts, four times, verbatim — and each assembly was a place to get
// the pase-suelto blind or the `tienePaquete` gate wrong. The ficha and the
// export got it wrong: both painted a spent drop-in "Crítico" while the roster
// read the SAME row "ok". Assembly now lives inside; a caller states stored
// facts and gets one verdict, and there is no second place to disagree.
//
// The rules this engine holds, unchanged by the deepening:
//
//  · FECHA WINS (A2): a package that is both date-expired and class-empty —
//    every expired finite pack, once read-time forfeit collapses its balance
//    to 0 — is VENCIDO, never SIN CLASES. No tie-break: the precedence is
//    unconditional. SIN CLASES is reserved for class-empty WITH days left.
//    Mirrors the client app's own precedence (packages/data/src/server/
//    agenda-miembro.ts `getSaldoMiembro`'s `vencido`, date-only).
//  · The CLASES-arm clock is the last CONSUMING visit (`ultimaConsumida`),
//    never the last visit of any kind — a non-decrementing walk-in must not
//    reset it.
//  · AÚN A TIEMPO is clocked from EXPIRY ONLY (days 1-15 since the DATE
//    lapsed) and excludes one-off passes + members with an app account (the
//    client app already nudges those at the moment of lapse).
//  · POR RENOVAR's "live package" gate is `estado !== "vencido"` — so a SIN
//    CLASES row (days left, 0 clases) always qualifies via the
//    `clases <= RENOVACION_CLASES` arm (owner stories 6/7: the tile's own
//    breakdown must carry a clases bucket so it always sums to the headline).
//  · pendienteOnline (and any no-package row) is a first-class `estado`,
//    never folded into "vencido" and never sorted below the graveyard (S4).
//    It is DERIVED here (`tieneCuenta && estado === "sin_paquete"`, #227 F1),
//    not a caller-supplied flag: a lapsed account-holder is a plain `vencido`
//    (the client app already nudges them), and the broader gate had promoted
//    the entire dead roster of an all-accounts gym into the group-0 actionable
//    tier — the exact defect spec #222 opens with. Since #227 F1 it always
//    implies `vence: null` too: "no package ever existed", not merely
//    correlated with it.
//  · The `ausente` fact is computed unconditionally (never gated on estado, so
//    it does not vanish the day a package lapses) and floors a null last-visit
//    on `alta` instead of hiding null-blind (S9/A9). `Ausencia` now carries the
//    RECOVERY-WINDOW gate with it (#229 opus review F1/F2/F5) — the raw ungated
//    fact is no longer surfaced, because the two consumers that had to AND it
//    themselves are exactly where a surface can forget to.
//  · The membership-vs-drop-in predicate (`esPaseSuelto`) blocks the CLASES
//    axis entirely, not just AÚN A TIEMPO's exclusion: a spent one-off pass
//    (0 clases is its NORMAL end state after a single visit) must never read
//    SIN CLASES, land in POR RENOVAR via the clases arm, or drive urgencia —
//    that is exactly the "22 vs. 4 real queue" bug (#184: 5 of 8 old tile-2
//    rows were spent Clase Individual passes, never members) this engine exists
//    to kill. A one-off pass can still appear in POR RENOVAR via the DÍAS arm
//    (its own validity window closing is a real fact); only the classes signal
//    is inert.
// ──────────────────────────────────────────────────────────────

import { derivarEstado, diasRestantes, forfeit, urgenciaCliente } from "./rules";
import type { Clases, EstadoCliente, Saldo, Urgencia } from "./types";

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
const AUSENTE_DIAS = 15;

/** A gym-local calendar day, "YYYY-MM-DD". The only date type crossing this
 *  seam, in or out: a `Date` carries a zone this module has no business
 *  resolving, and every caller already holds the gym's day as this string. */
export type DiaIso = string;

/** Which axis binds a non-vigente package: the date, or the class balance.
 *  null while vigente (nothing has ended). Fecha wins when both are true. */
export type Eje = "fecha" | "clases";

/** A package's derived lifecycle — never a verdict on the PERSON (no
 *  Activo/Inactivo anywhere in this engine). Literally `EstadoCliente`
 *  (types.ts) — the #225 unification made that the ONE estado type; this alias
 *  keeps this file's internal vocabulary (a package's state, not a "cliente"
 *  field) readable. */
export type EstadoPaquete = EstadoCliente;

/** INICIO's two bounded tiles. null past day 16, or when nothing binds. */
export type Tile = "por_renovar" | "aun_a_tiempo" | null;

/** A package's class GRANT as sold — 1..30, or null for ilimitado. Mirrors
 *  `packages/data/server/paquetes.ts`'s `PaqueteDTO.clases` exactly: the
 *  catalog's fixed archetype, NEVER a roster row's current remaining
 *  balance (which drains as the member trains and legitimately passes
 *  through 1 on its way to 0 for an 8-clase membership). */
export type ClaseGrant = number | null;

/** POR RENOVAR's breakdown buckets. Day buckets (Connect Gym's observed
 *  today/tomorrow/3d/5d shape) PLUS `clases` — so the buckets always sum to
 *  the tile's headline, including members whose classes (not days) bind. */
export type CuboRenovar = "hoy" | "manana" | "dosATres" | "cuatroACinco" | "seisOMas" | "clases";

// ── The seam: hechos + contexto → veredicto ───────────────────────────────

/** One cliente row's STORED facts. DB-column spellings for the three columns
 *  so a Supabase row is structurally assignable — nothing pre-derived,
 *  pre-parsed or pre-lifted: the ilimitado lift, the read-time forfeit, the
 *  `tienePaquete` gate and the pase-suelto classification are all this
 *  module's job, and a caller that did any of them by hand is a caller that
 *  could do them differently from its neighbour. */
export interface HechosCliente {
  paquete_nombre: string | null;
  /** NULL = ilimitado (the lift is internal). */
  clases_restantes: number | null;
  vence: DiaIso | null;
  /** Auth-linked app account (Door 2), i.e. `auth_user_id !== null`. Excludes
   *  the row from AÚN A TIEMPO (the client app already nudges them at lapse)
   *  and, with `sin_paquete`, is what MAKES it pendienteOnline. */
  tieneCuenta: boolean;
  /** Typed absence: a caller with no visit aggregate SAYS so ("no_leidas") and
   *  gets `ausencia: null` — never fabricated nulls/0s that would read as
   *  "never absent" (#226 F5) or reset the clases-arm clock to today. */
  visitas: "no_leidas" | { ultima: DiaIso | null; ultimaConsumida: DiaIso | null; alta: DiaIso };
}

/** The loop-invariant half of a verdict, built ONCE per read. BOTH fields are
 *  REQUIRED — no defaults, ever: a defaulted catalog param is exactly how the
 *  ficha and the respaldo shipped a spent drop-in as "Crítico" while the roster
 *  read the same row "ok" (#225 F2's residual). A missing catalog is a caller
 *  bug the compiler must catch, never a silently-empty Set. */
export interface ContextoVeredicto {
  hoy: DiaIso;
  /** The gym's pase-suelto package NAMES — build with `paseSueltoNombres`. A
   *  roster row stores only the sold package's display name, never its class
   *  GRANT (that lives on `paquetes`, keyed by name), so the
   *  membership-vs-drop-in predicate has to resolve against the catalog. */
  pasesSueltos: ReadonlySet<string>;
}

/** The absence FACT and its ready-to-render badge decision, together. `dias` is
 *  the `{n}D SIN VENIR` numeral — whole days since the last visit, floored on
 *  `alta` when there has never been one ("bought, never came" vs. "just signed
 *  up today"). `ausente` is that fact AND the recovery-WINDOW gate (#229 opus
 *  review F1/F2/F5): a `vigente` package (paid-up, still trainable), OR a
 *  `vencido` one within `RECUPERACION_DIAS` of expiry — WITHOUT the AÚN A
 *  TIEMPO tile's `tieneCuenta`/`esPaseSuelto` arms, so a lapsed member with an
 *  app account still shows the fact inside the window (A9: absence does not
 *  vanish at lapse; the tile excludes them because the client app nudges them,
 *  not because they stopped being absent). Deliberately false for `sin_clases`
 *  (paid but unable to train today — story 11 targets the paid-AND-ABLE
 *  drifter), `sin_paquete` (nothing paid), and a `vencido` row past the window
 *  (the "dead" — no longer this fact's audience). */
export interface Ausencia {
  dias: number;
  ausente: boolean;
}

/** The WHOLE derived verdict for one cliente row. JSON-serializable by
 *  construction (strings/numbers/booleans/null only), so it crosses the
 *  server→client boundary as a DTO field without a second shaping pass. */
export interface VeredictoCliente {
  /** All FOUR estados are minted HERE only, via `derivarEstado` — never a
   *  `tienePaquete ? … : "sin_paquete"` ternary at a call site. */
  estado: EstadoCliente;
  eje: Eje | null;
  /** The package's validity end day. GATED: null iff `estado === "sin_paquete"`
   *  — a package-less row with a stray non-null `vence` column reads sin_paquete
   *  on every axis, so CLIENTES and INICIO can never disagree about it (#229
   *  opus review F6; story 19: same word, same number). */
  vence: DiaIso | null;
  /** Whole days remaining until `vence` (negative once past), or null when
   *  there is no package. */
  dias: number | null;
  /** Whole days since the binding axis ended, or null while vigente/sin_paquete,
   *  or when the clases axis has no CONSUMING-visit anchor to clock from (never
   *  silently treated as 0 or "out of range"). */
  diasDesdeFin: number | null;
  /** Classes left AFTER read-time forfeit (brief Q2): an expired package shows
   *  0; ilimitado is untouched. */
  clases: Clases;
  /** FLOORED (a `vencido` or `sin_paquete` package is never `critico` — nothing
   *  left to run out of, and a package-less one never had anything to begin
   *  with, story 13) and pase-suelto-BLIND on the clases dimension. `vinculante`
   *  rides along so the directory can pick its primary numeral without a second
   *  `urgenciaCliente` call on a hand-rebuilt saldo. */
  urgencia: Urgencia;
  tile: Tile;
  /** `=== (tile === "por_renovar")` — carried so a consumer never restates the
   *  comparison (#225 F4: a second live meaning of this phrase was the bug map
   *  #180 was chartered to kill). */
  porRenovar: boolean;
  /** POR RENOVAR's bucket — non-null iff `porRenovar`, so the buckets always sum
   *  to the headline. */
  cubo: CuboRenovar | null;
  /** The day-16+ horizon (#229 opus review F3): `vencido`, not a one-off pass,
   *  past `RECUPERACION_DIAS` since expiry — the population AÚN A TIEMPO
   *  deliberately drops off the bottom of. INDEPENDENT of `tieneCuenta`. */
  fueraDeAlcance: boolean;
  /** DERIVED (#227 F1): `tieneCuenta && estado === "sin_paquete"` — a Door-2
   *  self-registrant who has NEVER bought a package. A lapsed account-holder is
   *  a plain `vencido`, never a "fresh arrival". */
  pendienteOnline: boolean;
  /** null iff the caller passed `visitas: "no_leidas"` — an honest absence of
   *  the fact, never a fabricated `{ dias: 0, ausente: false }`. */
  ausencia: Ausencia | null;
}

/** A row that carries its verdict — the shape the roster-level folds below read.
 *  Any DTO with a `veredicto` field satisfies it, so ordering and counting run
 *  over the caller's OWN rows and never need a parallel array kept in sync by
 *  object identity (#227 F8's fail-soft Map is gone with it). */
export interface ConVeredicto {
  readonly veredicto: VeredictoCliente;
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
  /** The day-16+ horizon disclosure (Fitco's "N ya pasaron ese límite") — see
   *  `VeredictoCliente.fueraDeAlcance`. */
  fueraDeAlcance: number;
}

// ── The membership-vs-drop-in predicate + its catalog Set ─────────────────

/** The membership-vs-drop-in predicate (#222 Implementation Decisions, #223
 *  finding 2): classify a package from its own CATALOG FACT, never a
 *  `paquete_nombre` string match in data/UI. A grant of exactly 1 class is a
 *  single-session drop-in — `packages/data/src/server/marketing.ts:72-73`
 *  already encodes this identical rule for the Precios CTA tiering ("1 for
 *  a single-session drop-in"), so this is the SAME structural fact, given a
 *  name in the domain vocabulary. A finite grant > 1, or ilimitado (null),
 *  is a membership. */
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

// ── Internals ────────────────────────────────────────────────────────────

const DIA_ISO = /^\d{4}-\d{2}-\d{2}$/;

/** "YYYY-MM-DD" → that day at LOCAL midnight, validating. A deliberate twin of
 *  @gym/format's `parseDay` — this package imports nothing internal (ADR-0011
 *  §6) — plus the guard a display-path parser has no reason to carry: a
 *  malformed day would otherwise yield an Invalid Date and every día below
 *  would silently read NaN. Names the FIELD and the offending value, because
 *  "Invalid Date" from four call sites says nothing about which column is bad. */
function parseDia(dia: DiaIso, campo: string): Date {
  if (!DIA_ISO.test(dia)) {
    throw new RangeError(`${campo}: día inválido ${JSON.stringify(dia)} — se esperaba "YYYY-MM-DD"`);
  }
  const [y, m, d] = dia.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function clasesNum(c: Clases): number {
  return c === "ilimitado" ? Infinity : c;
}

/** Whole days elapsed from `fecha` to `hoy` (positive once `fecha` is in the
 *  past) — `diasRestantes` run in reverse, at the same local-midnight
 *  granularity, so the two never drift apart. */
function diasDesde(fecha: Date, hoy: Date): number {
  return diasRestantes(hoy, fecha);
}

/** Whether the CLASES axis binds at the POR RENOVAR threshold — false for a
 *  one-off pass (see file header: a spent single-use pass is not "running out"
 *  of anything). */
function esClasesBoundParaRenovar(esPaseSueltoRow: boolean, clases: Clases): boolean {
  return !esPaseSueltoRow && clasesNum(clases) <= RENOVACION_CLASES;
}

/** POR RENOVAR's gate: a live package (not vencido, not sin_paquete) within
 *  RENOVACION_DIAS of its date, or down to RENOVACION_CLASES classes
 *  (paseSuelto-exempt on the clases arm). */
function esPorRenovar(
  estado: EstadoPaquete,
  dias: number,
  clases: Clases,
  esPaseSueltoRow: boolean,
): boolean {
  if (estado === "vencido" || estado === "sin_paquete") return false;
  return dias <= RENOVACION_DIAS || esClasesBoundParaRenovar(esPaseSueltoRow, clases);
}

function derivarTile(
  estado: EstadoPaquete,
  dias: number | null,
  clases: Clases,
  esPaseSueltoRow: boolean,
  tieneCuenta: boolean,
): Tile {
  if (dias === null) return null; // sin_paquete — no package to be in either tile
  // POR RENOVAR: a "live" package — NOT vencido; SIN CLASES still counts
  // (owner stories 6/7) — within RENOVACION_DIAS of its date, or down to
  // RENOVACION_CLASES classes (never via a one-off pass's spent clases — see
  // esClasesBoundParaRenovar). A SIN CLASES row (clases <= 0, not a one-off
  // pass) always satisfies the clases arm, so it is always in this tile.
  if (esPorRenovar(estado, dias, clases, esPaseSueltoRow)) return "por_renovar";
  if (estado === "vencido") {
    // dias < 0 whenever estado is "vencido", so -dias is always a definite,
    // positive number here — no null to guard against (#223 finding 6).
    const diasDesdeExpiry = -dias;
    // AÚN A TIEMPO: clocked from EXPIRY ONLY (owner ruling 1 + A2 fecha-wins,
    // #222) — days 1..15 since the DATE lapsed. Excludes one-off passes
    // (never members) and members with an app account (the client app
    // already nudges them). STRUCTURAL INVARIANT (#229 opus review F4): this
    // branch is only ever reached once `estado === "vencido"`, and FECHA WINS
    // (A2) means a vencido row's `eje` is ALWAYS "fecha" — `sin_clases` (the
    // only estado that sets `eje = "clases"`) can only occur while a package
    // is still vigente-BY-DATE. So `tile === "aun_a_tiempo"` ALWAYS implies
    // `eje === "fecha"`; there is no clases arm to break out here, which is
    // exactly why this tile is count-only with no bucket breakdown (unlike
    // POR RENOVAR's día/clases arms) — see `AunATiempoTile` in
    // apps/admin/.../inicio/_components/inicio.tsx.
    if (!esPaseSueltoRow && !tieneCuenta && diasDesdeExpiry >= 1 && diasDesdeExpiry <= RECUPERACION_DIAS) {
      return "aun_a_tiempo";
    }
  }
  return null;
}

/** The badge's population gate — the recovery WINDOW, never tile membership.
 *  See `Ausencia` for the full rationale. */
function muestraAusente(estado: EstadoPaquete, diasDesdeFin: number | null): boolean {
  return (
    estado === "vigente" ||
    (estado === "vencido" && diasDesdeFin !== null && diasDesdeFin <= RECUPERACION_DIAS)
  );
}

/** The visit aggregate with every día already validated + parsed (see
 *  `fechasDeVisitas`). */
interface VisitasParseadas {
  ultima: Date | null;
  ultimaConsumida: Date | null;
  alta: Date;
}

/** Validate + parse EVERY supplied día in one pass, whether or not the branch
 *  that consumes it is reached. Lazy parsing here was a real hole: the alta floor
 *  only reads when `ultima` is null, and the clases-arm clock only when the eje IS
 *  "clases" — so a malformed `alta` beside a valid `ultima` sailed straight
 *  through, and the seam's stated error mode is "a malformed DiaIso throws",
 *  not "throws if some sibling field also happens to be absent". */
function fechasDeVisitas(visitas: Exclude<HechosCliente["visitas"], "no_leidas">): VisitasParseadas {
  return {
    ultima: visitas.ultima === null ? null : parseDia(visitas.ultima, "visitas.ultima"),
    ultimaConsumida:
      visitas.ultimaConsumida === null
        ? null
        : parseDia(visitas.ultimaConsumida, "visitas.ultimaConsumida"),
    alta: parseDia(visitas.alta, "visitas.alta"),
  };
}

/** The absence fact + its badge decision. The anchor is `ultima`, floored to
 *  `alta` when the client has never visited — ONE computation, so the badge's
 *  digit and its visibility boolean can never disagree about which day they are
 *  counting from. A fresh alta (a same-day sign-up) correctly reads 0/false. */
function calcAusencia(
  visitas: VisitasParseadas,
  hoy: Date,
  estado: EstadoPaquete,
  diasDesdeFin: number | null,
): Ausencia {
  const dias = diasDesde(visitas.ultima ?? visitas.alta, hoy);
  return { dias, ausente: dias >= AUSENTE_DIAS && muestraAusente(estado, diasDesdeFin) };
}

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

// ── The verdict ──────────────────────────────────────────────────────────

/**
 * One cliente row's WHOLE derived lifecycle verdict. Pure — no I/O, no clock,
 * no stored state (ADR-0002): `ctx.hoy` is the gym's calendar day, passed in.
 *
 * Every surface (directorio, INICIO, ficha, pase de lista, respaldo) renders
 * THIS verdict; none derives its own copy of any part of it.
 */
export function derivarVeredicto(hechos: HechosCliente, ctx: ContextoVeredicto): VeredictoCliente {
  // EVERY supplied día is validated up front — never lazily, where only the branch
  // that happens to consume it would notice (see `fechasDeVisitas`). `vence` is
  // parsed even for a row whose `paquete_nombre` is null and whose date the gate
  // below therefore discards: a malformed stored day is a malformed stored day.
  const hoy = parseDia(ctx.hoy, "hoy");
  const venceDate = hechos.vence === null ? null : parseDia(hechos.vence, "vence");
  const visitas = hechos.visitas === "no_leidas" ? null : fechasDeVisitas(hechos.visitas);

  const esPaseSueltoRow =
    hechos.paquete_nombre !== null && ctx.pasesSueltos.has(hechos.paquete_nombre);

  // The `tienePaquete` gate, folded in (#229 opus review F6): a package-less row
  // with a stray non-null `vence` column must read sin_paquete on EVERY axis —
  // when the two roster reads each applied this by hand, one of them forgetting
  // was a live way for CLIENTES and INICIO to disagree about the same row.
  const dias =
    !hechos.paquete_nombre || venceDate === null ? null : diasRestantes(venceDate, hoy);
  // GATED with it: `vence` is non-null iff there is a package to be vencido about.
  const vence: DiaIso | null = dias === null ? null : hechos.vence;

  const clasesBase: Clases = hechos.clases_restantes === null ? "ilimitado" : hechos.clases_restantes;
  // Read-time forfeit (brief Q2): an expired package shows 0 classes; ilimitado
  // untouched. FECHA WINS makes this moot for `estado` — a forfeited balance and
  // its raw original both land on "vencido" — but it IS what the roster renders.
  const clases: Clases = dias === null ? 0 : forfeit(clasesBase, dias);

  // The ONE minting site of all four estados: the pase-suelto exemption, the
  // vigente/vencido/sin_clases partition and the no-package arm are all
  // derivarEstado's job (rules.ts), never a second inline restatement.
  const estado = derivarEstado(dias === null ? null : { clases, dias }, esPaseSueltoRow);
  const eje: Eje | null = estado === "vencido" ? "fecha" : estado === "sin_clases" ? "clases" : null;

  const diasDesdeFin: number | null =
    eje === "fecha" && dias !== null
      ? -dias
      : eje === "clases" && visitas?.ultimaConsumida
        ? diasDesde(visitas.ultimaConsumida, hoy)
        : null;

  const tile = derivarTile(estado, dias, clases, esPaseSueltoRow, hechos.tieneCuenta);
  const porRenovar = tile === "por_renovar";

  // A one-off pass's spent clases are inert for urgencia too (same principle as
  // esClasesBoundParaRenovar) — "ilimitado" blinds the clases dimension so only
  // días can drive a paseSuelto row's urgencia. `vinculante` comes off the SAME
  // blinded saldo, so the numeral the directory promotes agrees with the level.
  const saldo: Saldo = { clases: esPaseSueltoRow ? "ilimitado" : clases, dias: dias ?? 0 };
  const cruda = urgenciaCliente(saldo);

  return {
    estado,
    eje,
    vence,
    dias,
    diasDesdeFin,
    clases,
    urgencia: {
      // The FLOOR (#223 finding 3 / #225 F3): once a package has lapsed there is
      // nothing left to "run out of", and a package-less client never had
      // anything — both read "ok", never the alarming red the problem statement
      // measured (19 of 30 rows red, 1 actionable).
      nivel: estado === "vencido" || estado === "sin_paquete" ? "ok" : cruda.nivel,
      vinculante: cruda.vinculante,
    },
    tile,
    porRenovar,
    cubo: !porRenovar
      ? null
      : esClasesBoundParaRenovar(esPaseSueltoRow, clases)
        ? "clases" // the binding-axis arm (owner stories 6/7)
        : cuboDias(dias ?? 0), // a por_renovar row is never sin_paquete, so dias is real
    fueraDeAlcance:
      estado === "vencido" &&
      !esPaseSueltoRow && // a spent pass was never a recovery target in the first place
      diasDesdeFin !== null &&
      diasDesdeFin > RECUPERACION_DIAS,
    pendienteOnline: hechos.tieneCuenta && estado === "sin_paquete",
    ausencia: visitas === null ? null : calcAusencia(visitas, hoy, estado, diasDesdeFin),
  };
}

// ── Ordering (the ruled ordering, #222): actionable → current → expired
//    (most-recently-expired first). Three keys over ONE flat list — no
//    sections, no fold (#181 D1: the vendors with no declared "gone" lever
//    all keep one list where the label simply flips). ────────────────────

/** Non-null accessor for a VENCIDO row's diasDesdeFin. `estado === "vencido"`
 *  always sets `eje = "fecha"` and `diasDesdeFin = -dias`, a definite number —
 *  never null. Asserted, not defaulted: a silent `?? Infinity` here would make
 *  TWO such rows compare `Infinity - Infinity` = NaN, corrupting `toSorted`'s
 *  comparator (#223 finding 6). */
function diasDesdeVencido(v: VeredictoCliente): number {
  if (v.diasDesdeFin === null) {
    throw new Error("veredicto inválido: una fila vencida no trae diasDesdeFin");
  }
  return v.diasDesdeFin;
}

const NIVEL_RANGO: Record<Urgencia["nivel"], number> = { critico: 0, urgente: 1, pronto: 2, ok: 3 };

function grupoOrden(v: VeredictoCliente): 0 | 1 | 2 {
  if (v.pendienteOnline || v.estado === "sin_paquete" || v.porRenovar) return 0;
  if (v.estado === "vencido") return 2;
  return 1; // vigente, outside the tile (sin_clases is always in por_renovar — see invariant test)
}

function claveOrden(v: VeredictoCliente): number {
  if (v.pendienteOnline || v.estado === "sin_paquete") return -1; // ahead of even a día-0 renewal
  if (v.estado === "vencido") return diasDesdeVencido(v); // most-recently-expired first
  // Actionable/current tiers: sort by the BINDING AXIS (the floored urgencia
  // nivel), not raw días (#223 finding 5) — a SIN CLASES row is critico
  // regardless of how many días remain, and raw-día sorting stranded it
  // behind a merely-urgente días-bound row.
  return NIVEL_RANGO[v.urgencia.nivel] * 1000 + (v.dias ?? 0);
}

/** The roster-level half: order rows actionable → current → expired
 *  (most-recently-expired first, #222). Ordering only — never a fold, a tab,
 *  or a relocation. Generic over the caller's OWN row type: the verdict rides
 *  on the DTO, so there is no parallel array to keep aligned. */
export function ordenarLifecycle<T extends ConVeredicto>(filas: readonly T[]): T[] {
  return filas.toSorted(
    (a, b) =>
      grupoOrden(a.veredicto) - grupoOrden(b.veredicto) ||
      claveOrden(a.veredicto) - claveOrden(b.veredicto),
  );
}

// ── Counts (the shared counts, #222) ──────────────────────────────────────

/** Display labels for POR RENOVAR's buckets, keyed by the SAME `CuboRenovar`
 *  union `derivarVeredicto` assigns into — an exhaustive `Record`, so adding a
 *  bucket member fails THIS compile (a missing key) instead of silently vanishing
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
 *  `cubos` always sum to `total`: every por_renovar row carries exactly one
 *  `cubo` (`derivarVeredicto` assigns it alongside the tile itself, so a count
 *  can never fall out of step with the tile it breaks down). */
export function contarLifecycle(filas: readonly ConVeredicto[]): ConteosLifecycle {
  const cubos: Record<CuboRenovar, number> = {
    hoy: 0,
    manana: 0,
    dosATres: 0,
    cuatroACinco: 0,
    seisOMas: 0,
    clases: 0,
  };
  let vigentes = 0;
  let porRenovar = 0;
  let aunATiempo = 0;
  let pendienteOnline = 0;
  let fueraDeAlcance = 0;

  for (const { veredicto: v } of filas) {
    if (v.estado === "vigente") vigentes += 1;
    if (v.porRenovar) {
      porRenovar += 1;
      if (v.cubo) cubos[v.cubo] += 1;
    }
    if (v.tile === "aun_a_tiempo") aunATiempo += 1;
    if (v.pendienteOnline) pendienteOnline += 1;
    if (v.fueraDeAlcance) fueraDeAlcance += 1;
  }

  return {
    vigentes,
    total: filas.length,
    porRenovar: { total: porRenovar, cubos },
    aunATiempo: { total: aunATiempo },
    pendienteOnline,
    fueraDeAlcance,
  };
}
