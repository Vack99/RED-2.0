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
  ordenarLifecycle,
  type ConteosLifecycle,
  type FilaLifecycle,
  contarLifecycle,
} from "@gym/domain/lifecycle";
import { urgenciaCliente } from "@gym/domain/rules";
import type { NivelUrgencia, Saldo } from "@gym/domain/types";
import type { ClienteRosterDTO } from "@gym/data/server/clientes";
import { foldDiacritics } from "@gym/format";

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
  /** The `{n}D SIN VENIR` badge's ready-to-render decision (#229): the engine's
   *  `ausente` fact, gated to paid-up members — `vigente`/`sin_clases` (the
   *  package is still current), OR the exact AÚN A TIEMPO population (a lapsed
   *  member 1-15 días past expiry still shows the fact, per A9 — it does not
   *  vanish at lapse). Never true for `sin_paquete`/`pendienteOnline` (nothing
   *  paid) or a plain long-dead `vencido` row outside the recovery window. */
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
 *  urgencia AND `tile` for the por_renovar/null cases — its `esPorRenovar` call
 *  takes the exact same (estado, dias, clases, esPaseSuelto) the DTO's own
 *  `tile` was derived from, so the two can never disagree there. Only the ONE
 *  value that thin ctor structurally cannot produce — "aun_a_tiempo" (it has no
 *  `tieneCuenta`/visit clocks) — is taken from the DTO's real stamped tile
 *  (#229, `getClientesRoster` ran this SAME row through the FULL engine). This
 *  widens what the thin ctor could produce; it never overrides/contradicts it. */
function aFilaLifecycle(c: ClienteRosterDTO): FilaLifecycle {
  const base = derivarFilaLifecycle({
    estado: c.estado,
    dias: c.diasRest,
    clases: c.clasesRest,
    esPaseSuelto: c.esPaseSuelto,
    pendienteOnline: c.pendienteOnline,
  });
  const tile = c.tile === "aun_a_tiempo" ? c.tile : base.tile;
  return { ...base, tile, ausente: c.ausente, diasSinVenir: c.diasSinVenir };
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
      const aunATiempo = f.tile === "aun_a_tiempo";
      // The badge's paid-up gate (#222 story 11 / #229): vigente/sin_clases (the
      // package is still current), OR the exact AÚN A TIEMPO population — a
      // lapsed member 1-15 días past expiry still shows the absence fact (A9,
      // it does not vanish at lapse). Never sin_paquete/pendienteOnline (nothing
      // paid) and never a plain long-dead vencido row outside that window.
      const paidUp = c.estado === "vigente" || c.estado === "sin_clases";
      return {
        c,
        urgencia: f.urgencia,
        vinculante: urgenciaCliente(saldoParaUrgencia(c)).vinculante,
        renovar: f.tile === "por_renovar",
        aunATiempo,
        ausente: c.ausente && (paidUp || aunATiempo),
        diasSinVenir: c.diasSinVenir,
        diasDesdeVencido: f.diasDesdeFin,
        nombrePlegado: foldDiacritics(c.nombre),
      };
    })
    .filter((f): f is FilaRoster => f !== null);

  return { filas, conteos };
}
