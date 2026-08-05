// The CLIENTES view-model (#227): the ONE place this screen touches the
// #223/#225 lifecycle engine. `clientes.tsx` renders this output only — no
// thresholds, no day/class comparisons, no re-derived "por renovar"/urgencia/
// "aún a tiempo"/ausente live here or in the component; every fact below is a
// direct call into `@gym/domain/lifecycle` or `@gym/domain/rules`, or a
// straight pass-through of a fact `getClientesRoster` already stamped onto
// the DTO (#229).
//
// #229: `getClientesRoster` now fetches every fact `derivarLifecycle` (the
// FULL engine) needs — `tieneCuenta`, both visit clocks, alta (#226's
// aggregate) — and stamps the real `tile`/`ausente`/`diasSinVenir` onto
// `ClienteRosterDTO` itself. This vm still calls the thin `derivarFilaLifecycle`
// for eje/diasDesdeFin/urgencia (those never depended on the richer facts), then
// carries the DTO's real `tile`/`ausente` over the thin constructor's own
// structural placeholders (`tile` restricted to por_renovar/null, `ausente`
// hardcoded false) — never a second hand-rolled AÚN A TIEMPO/ausente guess.

import {
  derivarFilaLifecycle,
  muestraAusente,
  ordenarLifecycle,
  type ConteosLifecycle,
  type FilaLifecycle,
  contarLifecycle,
} from "@gym/domain/lifecycle";
import { urgenciaCliente } from "@gym/domain/rules";
import type { NivelUrgencia, Saldo } from "@gym/domain/types";
import type { ClienteRosterDTO } from "@gym/data/server/clientes";
import { foldDiacritics, telDigits } from "@gym/format";

/** One roster row, pre-shaped for rendering — the screen reads this and
 *  nothing else. `filas` arrives in the engine's RULED order (actionable →
 *  current → expired, most-recently-expired first, `ordenarLifecycle`); the
 *  screen's filters/search preserve that order (Array#filter is
 *  order-preserving), and only an explicit named sort overrides it. */
export interface FilaRoster {
  c: ClienteRosterDTO;
  /** The floored urgencia level (#225) — drives the accent stripe + numeral color. */
  urgencia: NivelUrgencia;
  /** Whichever of clases|días binds first (`urgenciaCliente`) — decides which
   *  numeral is primary for a still-live package (a 1-clase-left/25-días row
   *  shows the clase). */
  vinculante: "clases" | "dias";
  /** The SAME single-row POR RENOVAR predicate the tile/pase de lista use
   *  (`esPorRenovar`) — never a second `nivel ∈ {critico,urgente}` restatement. */
  renovar: boolean;
  /** The SAME AÚN A TIEMPO tile membership INICIO's tile counts (#229) — the
   *  directory's own filter/count on this population. */
  aunATiempo: boolean;
  /** The `{n}D SIN VENIR` badge's ready-to-render decision (#229, gate fixed by
   *  opus review F1/F2/F5): the engine's `ausente` fact, gated by
   *  `muestraAusente` — the recovery WINDOW (`vigente`, or `vencido` within
   *  `RECUPERACION_DIAS` of expiry), never tile membership. A lapsed member
   *  WITH an app account still shows the fact inside that window (A9 — it
   *  does not vanish at lapse — even though `tieneCuenta` excludes them from
   *  the AÚN A TIEMPO tile itself). Never true for `sin_clases` (paid but
   *  unable to train today — story 11 targets paid-AND-ABLE), `sin_paquete`/
   *  `pendienteOnline` (nothing paid), or a `vencido` row past the window
   *  (the "dead"). */
  ausente: boolean;
  /** The badge's numeral — meaningless when `ausente` is false. */
  diasSinVenir: number;
  /** Days since the package expired — the VENCIDO row's primary numeral
   *  (always positive; null while the package hasn't lapsed by date). */
  diasDesdeVencido: number | null;
  /** Diacritic-folded once per roster read (#224), not per keystroke. */
  nombrePlegado: string;
}

/** The header ratio's `vigentes`/`total` + the filter chips' `porRenovar`/
 *  `pendienteOnline`/`aunATiempo` counts — ONE shared source
 *  (`contarLifecycle`), never an inline `.filter(...).length` restatement.
 *  Real as of #229: `getClientesRoster` now stamps the real `tile` (including
 *  "aun_a_tiempo") onto every DTO, so `aFilaLifecycle` carries it through
 *  instead of the thin constructor's structural "always por_renovar/null" —
 *  `contarLifecycle`'s `aunATiempo.total` is no longer a fake zero here (the
 *  #227 F4 Omit that guarded against that fake zero is gone with it). */
export type ConteosRoster = ConteosLifecycle;

export interface RosterVista {
  /** Ruled order (`ordenarLifecycle`). */
  filas: FilaRoster[];
  conteos: ConteosRoster;
}

/**
 * Roster search predicate (#239): a name hit is diacritic-folded on both sides
 * (`nombrePlegado` is pre-folded once per row by `derivarVistaRoster`, `query`
 * is folded here). The tel arm is a raw substring check (tel never carries
 * diacritics) and only participates when `query` itself carries at least one
 * digit — a letters-only query (e.g. "ana") must never fall through to
 * "matches every client with a phone" the way the `vender.tsx` picker's
 * digit-stripped comparison did (#239's other call site: stripping non-digits
 * from a letters-only query yields "", and every string `.includes("")`).
 * This arm was never exploitable via that exact mechanism (it compares the
 * RAW query, so it never collapses to ""), but the guard makes the invariant
 * explicit instead of incidental — a future change to a digit-stripped
 * comparison here (to also match a formatted tel) would otherwise silently
 * reintroduce the same bug.
 */
export function filaCoincideBusqueda(x: FilaRoster, query: string): boolean {
  if (!query) return true;
  if (x.nombrePlegado.includes(foldDiacritics(query))) return true;
  if (!telDigits(query)) return false;
  return !!x.c.tel?.includes(query);
}

/** The saldo the engine actually reasons about for a package's urgency: a
 *  pase suelto's classes are BLIND (mirrors `derivarLifecycle`'s own
 *  `clases: fila.esPaseSuelto ? "ilimitado" : fila.clases` — a spent 1-class
 *  drop-in is its NORMAL end state, not a running-out signal). #227 F2: this
 *  vm independently derives urgencia/vinculante (see file header — it can't
 *  call `derivarLifecycle` itself), so both call sites have to apply the
 *  SAME blind or a spent drop-in renders crítico-red with "0 clases" as its
 *  primary numeral and jumps the actionable tier via NIVEL_RANGO. */
function saldoParaUrgencia(c: ClienteRosterDTO): Saldo {
  return { clases: c.esPaseSuelto ? "ilimitado" : c.clasesRest, dias: c.diasRest };
}

/** Map one already-derived roster row to the engine's per-row input. The thin
 *  `derivarFilaLifecycle` constructor (#228 F4) still supplies eje/diasDesdeFin/
 *  urgencia (unaffected by the richer #226 facts — no re-derivation needed
 *  there). `tile`/`ausente`/`diasSinVenir` are taken straight off the DTO
 *  (#229 opus review F7): `getClientesRoster` already ran this SAME row through
 *  the FULL engine (`derivarLifecycle`) and stamped its real verdict, so a
 *  second hand-rolled derivation here — even one restricted to "only widen,
 *  never contradict" — is the exact "kept in sync by one line" risk #228's
 *  opus review F4 flagged; trust the DTO instead. */
function aFilaLifecycle(c: ClienteRosterDTO): FilaLifecycle {
  const base = derivarFilaLifecycle({
    estado: c.estado,
    dias: c.diasRest,
    clases: c.clasesRest,
    esPaseSuelto: c.esPaseSuelto,
    pendienteOnline: c.pendienteOnline,
  });
  return { ...base, tile: c.tile, ausente: c.ausente, diasSinVenir: c.diasSinVenir };
}

/** The screen's one entry point into the lifecycle engine: order (ruled),
 *  counts (header ratio + filter chips), and the per-row presentation facts
 *  the rows render. Pure — `clientes` is already derived-at-read
 *  (`getClientesRoster`); this only reshapes it. */
export function derivarVistaRoster(clientes: ClienteRosterDTO[]): RosterVista {
  const porFila = new Map<FilaLifecycle, ClienteRosterDTO>();
  const filasEngine = clientes.map((c) => {
    const f = aFilaLifecycle(c);
    porFila.set(f, c);
    return f;
  });

  // #229: aunATiempo is real now (see ConteosRoster) — no narrowed rebuild needed.
  const conteos: ConteosRoster = contarLifecycle(filasEngine);

  // #227 F8: `porFila` is keyed by FilaLifecycle object identity, which holds
  // today (`ordenarLifecycle` reorders the array via `toSorted`, never
  // cloning elements) but isn't a contract `ordenarLifecycle`'s signature
  // promises. Fail soft — drop a row rather than crash the render — if a
  // future copy-returning implementation ever breaks that assumption.
  const filas: FilaRoster[] = ordenarLifecycle(filasEngine)
    .map((f) => {
      const c = porFila.get(f);
      if (!c) return null;
      return {
        c,
        urgencia: f.urgencia,
        vinculante: urgenciaCliente(saldoParaUrgencia(c)).vinculante,
        renovar: f.tile === "por_renovar",
        aunATiempo: f.tile === "aun_a_tiempo",
        // The badge's gate (#229 opus review F1/F2/F5): `muestraAusente` — the
        // recovery WINDOW, never tile membership — so a lapsed member WITH an
        // app account still shows the fact inside it (A9).
        ausente: c.ausente && muestraAusente(f),
        diasSinVenir: c.diasSinVenir,
        diasDesdeVencido: f.diasDesdeFin,
        nombrePlegado: foldDiacritics(c.nombre),
      };
    })
    .filter((f): f is FilaRoster => f !== null);

  return { filas, conteos };
}
