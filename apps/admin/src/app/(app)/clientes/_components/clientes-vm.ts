// The CLIENTES view-model (#227): the ONE place this screen touches the lifecycle
// engine. `clientes.tsx` renders this output only — no thresholds, no day/class
// comparisons, no re-derived "por renovar"/urgencia/"aún a tiempo"/ausente live
// here or in the component.
//
// Since the "una fila → un veredicto" deepening this file derives NOTHING: every
// row arrives from `getClientesRoster` already carrying its `veredicto`, so this
// is order (`ordenarLifecycle`), counts (`contarLifecycle`) and a flat rename of
// the fields the TSX reads. The three things that used to be re-derived here —
// urgencia, `vinculante`, and the ausente badge's window gate — were each a copy
// that had to stay in step with the engine by hand (#227 F2/F3, #229 F1/F2/F5);
// the identity Map that paired a derived row back to its DTO, and the fail-soft
// filter guarding it (#227 F8), are gone with them: the verdict rides ON the row.

import { contarLifecycle, ordenarLifecycle, type ConteosLifecycle } from "@gym/domain/lifecycle";
import type { NivelUrgencia } from "@gym/domain/types";
import type { ClienteRosterDTO } from "@gym/data/server/clientes";
import { foldDiacritics, telDigits } from "@gym/format";

/** One roster row, pre-shaped for rendering — the screen reads this and
 *  nothing else. `filas` arrives in the engine's RULED order (actionable →
 *  current → expired, most-recently-expired first, `ordenarLifecycle`); the
 *  screen's filters/search preserve that order (Array#filter is
 *  order-preserving), and only an explicit named sort overrides it. */
export interface FilaRoster {
  c: ClienteRosterDTO;
  /** The floored, pase-suelto-blind urgencia level — drives the accent stripe +
   *  numeral color. */
  urgencia: NivelUrgencia;
  /** Whichever of clases|días binds first — decides which numeral is primary for
   *  a still-live package (a 1-clase-left/25-días row shows the clase). */
  vinculante: "clases" | "dias";
  /** The SAME single-row POR RENOVAR gate the tile/pase de lista use — never a
   *  second `nivel ∈ {critico,urgente}` restatement. */
  renovar: boolean;
  /** The SAME AÚN A TIEMPO tile membership INICIO's tile counts (#229) — the
   *  directory's own filter/count on this population. */
  aunATiempo: boolean;
  /** The `{n}D SIN VENIR` badge's ready-to-render decision — the engine's own
   *  `ausencia.ausente`, which already carries the recovery-WINDOW gate (see
   *  `Ausencia` in @gym/domain/lifecycle). False when the roster carried no visit
   *  aggregate at all. */
  ausente: boolean;
  /** The badge's numeral — meaningless when `ausente` is false. */
  diasSinVenir: number;
  /** The veredicto's `diasDesdeFin` — days since the BINDING axis ended. The row
   *  only renders it on the `vencido` branch, where it is days-since-expiry and
   *  always positive; null while vigente/sin_paquete. */
  diasDesdeVencido: number | null;
  /** Diacritic-folded once per roster read (#224), not per keystroke. */
  nombrePlegado: string;
}

/** The header ratio's `vigentes`/`total` + the filter chips' `porRenovar`/
 *  `pendienteOnline`/`aunATiempo` counts — ONE shared source
 *  (`contarLifecycle`), never an inline `.filter(...).length` restatement. */
export type ConteosRoster = ConteosLifecycle;

export interface RosterVista {
  /** Ruled order (`ordenarLifecycle`). */
  filas: FilaRoster[];
  conteos: ConteosRoster;
}

/**
 * Roster search predicate (#239, opus review F2): a name hit is diacritic-folded on
 * both sides (`nombrePlegado` is pre-folded once per row by `derivarVistaRoster`,
 * `query` is folded here). The tel arm strips non-digits from BOTH sides before
 * comparing — matching `pickerCoincide` (vender-vm.ts) exactly — because the DB
 * CHECK allows a separator-formatted stored tel (the "-"/" " digit-intake rule lives
 * at intake, not storage), so a raw `tel.includes(query)` misses "614 1234" against
 * a stored "6141234567" even though both hold the same digits. The digit guard
 * (only participate when `query` itself carries ≥1 digit) is what stops a
 * letters-only query from matching every phone — now load-bearing, since this arm
 * really does strip to "" for one, not merely documentation of an already-safe raw
 * comparison.
 */
export function filaCoincideBusqueda(x: FilaRoster, query: string): boolean {
  if (!query) return true;
  if (x.nombrePlegado.includes(foldDiacritics(query))) return true;
  const q = telDigits(query);
  if (!q) return false;
  return !!x.c.tel && telDigits(x.c.tel).includes(q);
}

/** The screen's one entry point into the lifecycle engine: order (ruled),
 *  counts (header ratio + filter chips), and the per-row presentation facts
 *  the rows render. Pure — `clientes` is already derived-at-read
 *  (`getClientesRoster`); this only reshapes it. */
export function derivarVistaRoster(clientes: ClienteRosterDTO[]): RosterVista {
  const conteos: ConteosRoster = contarLifecycle(clientes);

  const filas: FilaRoster[] = ordenarLifecycle(clientes).map((c) => {
    const v = c.veredicto;
    return {
      c,
      urgencia: v.urgencia.nivel,
      vinculante: v.urgencia.vinculante,
      renovar: v.porRenovar,
      aunATiempo: v.tile === "aun_a_tiempo",
      ausente: v.ausencia?.ausente ?? false,
      diasSinVenir: v.ausencia?.dias ?? 0,
      diasDesdeVencido: v.diasDesdeFin,
      nombrePlegado: foldDiacritics(c.nombre),
    };
  });

  return { filas, conteos };
}
