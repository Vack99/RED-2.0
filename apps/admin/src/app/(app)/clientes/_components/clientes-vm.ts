// The CLIENTES view-model (#227): the ONE place this screen touches the
// #223/#225 lifecycle engine. `clientes.tsx` renders this output only — no
// thresholds, no day/class comparisons, no re-derived "por renovar"/urgencia
// live here or in the component; every fact below is a direct call into
// `@gym/domain/lifecycle` or `@gym/domain/rules`.
//
// Why this file builds its own `FilaLifecycle` instead of calling
// `derivarLifecycle`: that function's input (`FilaRosterLifecycle`) also
// carries `tieneCuenta`/`ultimaVisitaConsumida`/`ultimaVisita`/`alta` — facts
// `getClientesRoster` does not fetch yet (#222 sequences the ausente badge +
// clases clock behind a new RPC, landing AFTER epic #203). Every field this
// module's ordering/counts actually READ (verified against `ordenarLifecycle`
// and `contarLifecycle`'s bodies in lifecycle.ts: `estado`, `tile`,
// `diasDesdeFin`, `urgencia`, `dias`, `fila.pendienteOnline`,
// `fila.esPaseSuelto`, `fila.clases`) is populated from REAL, already-derived
// roster facts (`ClienteRosterDTO`). The remaining `FilaRosterLifecycle`
// fields (`vence`, `tieneCuenta`, `ultimaVisitaConsumida`, `ultimaVisita`,
// `alta`) are structurally required but never dereferenced by either
// function — inert placeholders, not fabricated facts fed to a decision. The
// `aunATiempo` tile is therefore never assigned here either (it needs
// `tieneCuenta`) — CLIENTES doesn't render it; that tile is INICIO's/#228's,
// once the RPC lands.

import {
  esPorRenovar,
  nivelUrgenciaLifecycle,
  ordenarLifecycle,
  type ConteosLifecycle,
  type FilaLifecycle,
  type FilaRosterLifecycle,
  contarLifecycle,
} from "@gym/domain/lifecycle";
import { urgenciaCliente } from "@gym/domain/rules";
import type { NivelUrgencia } from "@gym/domain/types";
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
  /** Days since the package expired — the VENCIDO row's primary numeral
   *  (always positive; null while the package hasn't lapsed by date). */
  diasDesdeVencido: number | null;
  /** Diacritic-folded once per roster read (#224), not per keystroke. */
  nombrePlegado: string;
}

export interface RosterVista {
  /** Ruled order (`ordenarLifecycle`). */
  filas: FilaRoster[];
  /** The header ratio's `vigentes`/`total` + the filter chips' `porRenovar`/
   *  `pendienteOnline` counts — ONE shared source (`contarLifecycle`), never
   *  an inline `.filter(...).length` restatement. */
  conteos: ConteosLifecycle;
}

/** Map one already-derived roster row to the engine's per-row input. The
 *  `fila.*` facts beyond `pendienteOnline`/`esPaseSuelto`/`clases` are never
 *  read by `ordenarLifecycle`/`contarLifecycle` (see file header) — see
 *  comment above for why they're inert here rather than fetched. */
function aFilaLifecycle(c: ClienteRosterDTO): FilaLifecycle {
  const fila: FilaRosterLifecycle = {
    vence: null, // unread by ordering/counts; a real Date needs a fetch #227 doesn't add
    clases: c.clasesRest,
    esPaseSuelto: c.esPaseSuelto,
    tieneCuenta: false, // unread by ordering/counts; aunATiempo needs it, not rendered here
    pendienteOnline: c.pendienteOnline,
    ultimaVisitaConsumida: null, // unread by ordering/counts (clases-eje diasDesdeFin only)
    ultimaVisita: null, // unread by ordering/counts (feeds only the ausente badge, #228)
    alta: new Date(0), // unread by ordering/counts (feeds only the ausente badge, #228)
  };
  const eje = c.estado === "vigente" ? null : c.estado === "vencido" ? "fecha" : "clases";
  return {
    fila,
    estado: c.estado,
    eje,
    dias: c.diasRest,
    diasDesdeFin: c.estado === "vencido" ? -c.diasRest : null,
    tile: esPorRenovar(c.estado, c.diasRest, c.clasesRest, c.esPaseSuelto) ? "por_renovar" : null,
    urgencia: nivelUrgenciaLifecycle({ clases: c.clasesRest, dias: c.diasRest }, c.estado),
    ausente: false, // not surfaced by CLIENTES (#227) — INICIO's badge, lands with #228's RPC
  };
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

  const conteos = contarLifecycle(filasEngine);

  const filas: FilaRoster[] = ordenarLifecycle(filasEngine).map((f) => {
    const c = porFila.get(f)!;
    const saldo = { clases: c.clasesRest, dias: c.diasRest };
    return {
      c,
      urgencia: f.urgencia,
      vinculante: urgenciaCliente(saldo).vinculante,
      renovar: f.tile === "por_renovar",
      diasDesdeVencido: f.diasDesdeFin,
      nombrePlegado: foldDiacritics(c.nombre),
    };
  });

  return { filas, conteos };
}
