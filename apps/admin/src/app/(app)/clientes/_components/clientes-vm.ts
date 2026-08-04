// The CLIENTES view-model (#227): the ONE place this screen touches the
// #223/#225 lifecycle engine. `clientes.tsx` renders this output only — no
// thresholds, no day/class comparisons, no re-derived "por renovar"/urgencia
// live here or in the component; every fact below is a direct call into
// `@gym/domain/lifecycle` or `@gym/domain/rules`.
//
// Why this file builds its `FilaLifecycle` via `derivarFilaLifecycle` instead
// of `derivarLifecycle`: that function's input (`FilaRosterLifecycle`) also
// carries `tieneCuenta`/`ultimaVisitaConsumida`/`ultimaVisita`/`alta` — facts
// `getClientesRoster` does not fetch yet (#222 sequences the ausente badge +
// clases clock behind a new RPC, landing AFTER epic #203). `derivarFilaLifecycle`
// (#228 opus review F4) is the ONE shared constructor for exactly this
// thinner input — INICIO's `getRosterResumen` (packages/data) is its other
// caller, so this vm and that read can never hand-roll two diverging
// approximations of the same row again. The `aunATiempo` tile is never
// assigned by that constructor (it needs `tieneCuenta`) — CLIENTES doesn't
// render it; that tile is INICIO's/#229's, once the RPC lands.

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
  /** Days since the package expired — the VENCIDO row's primary numeral
   *  (always positive; null while the package hasn't lapsed by date). */
  diasDesdeVencido: number | null;
  /** Diacritic-folded once per roster read (#224), not per keystroke. */
  nombrePlegado: string;
}

/** The header ratio's `vigentes`/`total` + the filter chips' `porRenovar`/
 *  `pendienteOnline` counts — ONE shared source (`contarLifecycle`), never
 *  an inline `.filter(...).length` restatement. `aunATiempo` is DROPPED
 *  (#227 F4, compiler-enforced, not comment-enforced): this vm hardcodes
 *  every row's `tieneCuenta` to `false` (see `aFilaLifecycle` below), so
 *  `contarLifecycle`'s `aunATiempo.total` is structurally always 0 here —
 *  a fake zero a future INICIO tile (#228) could reach for by accident once
 *  the real RPC lands. Narrowing the TYPE keeps that read a compile error
 *  instead of a silent wrong number. */
export type ConteosRoster = Omit<ConteosLifecycle, "aunATiempo">;

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

/** Map one already-derived roster row to the engine's per-row input, via the
 *  shared `derivarFilaLifecycle` constructor (#228 F4) — no second hand-rolled
 *  copy of eje/diasDesdeFin/urgencia here. */
function aFilaLifecycle(c: ClienteRosterDTO): FilaLifecycle {
  return derivarFilaLifecycle({
    estado: c.estado,
    dias: c.diasRest,
    clases: c.clasesRest,
    esPaseSuelto: c.esPaseSuelto,
    pendienteOnline: c.pendienteOnline,
  });
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

  // #227 F4: build the narrowed shape explicitly rather than casting — drops
  // `aunATiempo`, which this vm cannot honestly compute (see ConteosRoster).
  const { vigentes, total, porRenovar, pendienteOnline } = contarLifecycle(filasEngine);
  const conteos: ConteosRoster = { vigentes, total, porRenovar, pendienteOnline };

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
        diasDesdeVencido: f.diasDesdeFin,
        nombrePlegado: foldDiacritics(c.nombre),
      };
    })
    .filter((f): f is FilaRoster => f !== null);

  return { filas, conteos };
}
