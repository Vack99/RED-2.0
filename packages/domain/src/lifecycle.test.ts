import { describe, expect, it } from "vitest";
import { contarLifecycle, derivarLifecycle, esPaseSuelto, nivelUrgenciaLifecycle, ordenarLifecycle } from "./lifecycle";
import type { FilaRosterLifecycle } from "./lifecycle";

// Fixed anchor (arbitrary, mirrors the /proto fixture's own 2026-08-02) so
// every test reasons in whole "días" instead of re-deriving an offset.
const HOY = new Date(2026, 7, 2);

function haceDias(n: number): Date {
  return new Date(HOY.getFullYear(), HOY.getMonth(), HOY.getDate() - n);
}
function enDias(n: number): Date {
  return new Date(HOY.getFullYear(), HOY.getMonth(), HOY.getDate() + n);
}

// A comfortably-vigente ilimitado row recently seen — every test overrides
// only the facts it cares about.
const BASE: FilaRosterLifecycle = {
  vence: enDias(20),
  clases: "ilimitado",
  esPaseSuelto: false,
  tieneCuenta: false,
  pendienteOnline: false,
  ultimaVisitaConsumida: haceDias(1),
  ultimaVisita: haceDias(1),
  alta: haceDias(200),
};

function fila(overrides: Partial<FilaRosterLifecycle>): FilaRosterLifecycle {
  return { ...BASE, ...overrides };
}

describe("esPaseSuelto — the membership-vs-drop-in predicate (#223 finding 2)", () => {
  it("classifies a grant of exactly 1 class as a one-off pass", () => {
    expect(esPaseSuelto(1)).toBe(true);
  });

  it("classifies any finite grant > 1 as a membership", () => {
    expect(esPaseSuelto(2)).toBe(false);
    expect(esPaseSuelto(8)).toBe(false);
    expect(esPaseSuelto(12)).toBe(false);
  });

  it("classifies ilimitado (a null grant) as a membership", () => {
    expect(esPaseSuelto(null)).toBe(false);
  });
});

describe("nivelUrgenciaLifecycle — the urgencia floor (#223 finding 3): expired is never crítico", () => {
  it("floors an expired saldo to ok, never crítico", () => {
    // Raw urgenciaCliente would say "critico" for both (dias <= 3) — the
    // floor is unconditional, not scaled by how long ago it lapsed.
    expect(nivelUrgenciaLifecycle({ clases: 8, dias: -5 })).toBe("ok");
    expect(nivelUrgenciaLifecycle({ clases: 8, dias: -40 })).toBe("ok");
  });

  it("does not floor a still-valid saldo — reuses urgenciaCliente's thresholds unchanged", () => {
    expect(nivelUrgenciaLifecycle({ clases: 8, dias: 2 })).toBe("critico");
    expect(nivelUrgenciaLifecycle({ clases: 8, dias: 20 })).toBe("ok");
  });
});

describe("derivarLifecycle — estado + eje (fecha wins, ruling A2)", () => {
  it("is vigente with días and clases to spare", () => {
    const r = derivarLifecycle(fila({ vence: enDias(20), clases: 8 }), HOY);
    expect(r.estado).toBe("vigente");
    expect(r.eje).toBeNull();
  });

  it("is vencido once the date has lapsed, even with clases still on the row", () => {
    const r = derivarLifecycle(fila({ vence: haceDias(10), clases: 5 }), HOY);
    expect(r.estado).toBe("vencido");
    expect(r.eje).toBe("fecha");
    expect(r.dias).toBe(-10);
  });

  it("is sin_clases when clases are exhausted but días remain (SIN CLASES reserved for this)", () => {
    const r = derivarLifecycle(fila({ vence: enDias(15), clases: 0 }), HOY);
    expect(r.estado).toBe("sin_clases");
    expect(r.eje).toBe("clases");
  });

  it("FORFEIT COLLAPSE — date-expired AND class-empty: fecha wins unconditionally, never SIN CLASES", () => {
    // Every expired finite pack reaches the engine with clases already
    // forfeited to 0 (packages/data/derive.ts forfeit()), so both conditions
    // are true simultaneously. There is no tie-break to get wrong: VENCIDO.
    const r = derivarLifecycle(fila({ vence: haceDias(3), clases: 0 }), HOY);
    expect(r.estado).toBe("vencido");
    expect(r.eje).toBe("fecha");
  });

  it("keeps the vence day itself (día 0) vigente — a valid training day (ruling C9 precedent)", () => {
    const r = derivarLifecycle(fila({ vence: HOY, clases: 8 }), HOY);
    expect(r.estado).toBe("vigente");
    expect(r.dias).toBe(0);
  });

  it("a spent one-off pass never reads SIN CLASES — 0 clases is its normal end state", () => {
    const r = derivarLifecycle(fila({ vence: enDias(15), clases: 0, esPaseSuelto: true }), HOY);
    expect(r.estado).toBe("vigente");
    expect(r.eje).toBeNull();
  });
});

describe("derivarLifecycle — el reloj del brazo de clases es la última visita CONSUMIDORA", () => {
  it("0-CLASSES-STILL-TRAINING: lands in POR RENOVAR from the clases arm regardless of how many días remain", () => {
    const r = derivarLifecycle(
      fila({ vence: enDias(18), clases: 0, ultimaVisitaConsumida: haceDias(5), ultimaVisita: haceDias(5) }),
      HOY,
    );
    expect(r.estado).toBe("sin_clases");
    expect(r.eje).toBe("clases");
    expect(r.diasDesdeFin).toBe(5);
    expect(r.tile).toBe("por_renovar");
  });

  it("a NON-CONSUMING walk-in does not reset the clases-arm clock", () => {
    const r = derivarLifecycle(
      fila({
        vence: enDias(18),
        clases: 0,
        ultimaVisitaConsumida: haceDias(5), // the visit that actually ran the balance to 0
        ultimaVisita: HOY, // a later walk-in that did NOT decrement (consumio: false)
      }),
      HOY,
    );
    expect(r.diasDesdeFin).toBe(5); // frozen at the consuming visit, not reset to 0
  });

  it("never null-silently-out-of-range: no consuming-visit anchor reports null, not 0 or Infinity", () => {
    const r = derivarLifecycle(
      fila({ vence: enDias(18), clases: 0, ultimaVisitaConsumida: null, ultimaVisita: null }),
      HOY,
    );
    expect(r.eje).toBe("clases");
    expect(r.diasDesdeFin).toBeNull();
  });
});

describe("derivarLifecycle — POR RENOVAR", () => {
  it("día 10 is inside the window; día 11 is outside (RENOVACION_DIAS boundary)", () => {
    expect(derivarLifecycle(fila({ vence: enDias(10), clases: 8 }), HOY).tile).toBe("por_renovar");
    expect(derivarLifecycle(fila({ vence: enDias(11), clases: 8 }), HOY).tile).toBeNull();
  });

  it("día 0 (vence today) is inside the window", () => {
    expect(derivarLifecycle(fila({ vence: HOY, clases: 8 }), HOY).tile).toBe("por_renovar");
  });

  it("clases <= 1 triggers the tile regardless of how many días remain", () => {
    const r = derivarLifecycle(fila({ vence: enDias(25), clases: 1 }), HOY);
    expect(r.estado).toBe("vigente");
    expect(r.tile).toBe("por_renovar");
  });

  it("every SIN CLASES row is always in POR RENOVAR (0 <= RENOVACION_CLASES, invariant)", () => {
    const r = derivarLifecycle(fila({ vence: enDias(29), clases: 0 }), HOY);
    expect(r.estado).toBe("sin_clases");
    expect(r.tile).toBe("por_renovar");
  });

  it("a comfortably vigente row (>10 días, >1 clase) is in neither tile", () => {
    expect(derivarLifecycle(fila({ vence: enDias(20), clases: 8 }), HOY).tile).toBeNull();
  });

  it("a one-off pass's spent clases never trigger the tile — only its own días arm can", () => {
    const spentButNotDueSoon = derivarLifecycle(
      fila({ vence: enDias(25), clases: 0, esPaseSuelto: true }),
      HOY,
    );
    expect(spentButNotDueSoon.tile).toBeNull();
    const spentAndDueSoon = derivarLifecycle(
      fila({ vence: enDias(4), clases: 0, esPaseSuelto: true }),
      HOY,
    );
    expect(spentAndDueSoon.tile).toBe("por_renovar"); // via días, not clases
  });
});

describe("derivarLifecycle — AÚN A TIEMPO, clocked from expiry only", () => {
  it("día 1 is inside the window; día 15 is inside; día 16 is outside (RECUPERACION_DIAS boundary)", () => {
    expect(derivarLifecycle(fila({ vence: haceDias(1), clases: 8 }), HOY).tile).toBe("aun_a_tiempo");
    expect(derivarLifecycle(fila({ vence: haceDias(15), clases: 8 }), HOY).tile).toBe("aun_a_tiempo");
    expect(derivarLifecycle(fila({ vence: haceDias(16), clases: 8 }), HOY).tile).toBeNull();
  });

  it("excludes a spent one-off pass — never a renewal target", () => {
    const r = derivarLifecycle(fila({ vence: haceDias(5), clases: 0, esPaseSuelto: true }), HOY);
    expect(r.estado).toBe("vencido");
    expect(r.tile).toBeNull();
  });

  it("excludes a member with an app account — the client app already nudges them at lapse", () => {
    const r = derivarLifecycle(fila({ vence: haceDias(5), clases: 8, tieneCuenta: true }), HOY);
    expect(r.tile).toBeNull();
  });

  it("is clocked from the DATE only — attendance recency does not move it", () => {
    const r = derivarLifecycle(
      fila({ vence: haceDias(5), clases: 8, ultimaVisitaConsumida: haceDias(40), ultimaVisita: haceDias(40) }),
      HOY,
    );
    expect(r.tile).toBe("aun_a_tiempo");
    expect(r.diasDesdeFin).toBe(5);
  });

  it("día 44 (long-dead) is well outside the window", () => {
    expect(derivarLifecycle(fila({ vence: haceDias(44), clases: 8 }), HOY).tile).toBeNull();
  });
});

describe("derivarLifecycle — pendienteOnline y sin_paquete: primera clase, nunca 'fuera de alcance'", () => {
  it("a pendienteOnline row is a first-class sin_paquete estado, no tile", () => {
    const r = derivarLifecycle(
      fila({ vence: null, pendienteOnline: true, tieneCuenta: true, ultimaVisita: null, alta: HOY }),
      HOY,
    );
    expect(r.estado).toBe("sin_paquete");
    expect(r.eje).toBeNull();
    expect(r.tile).toBeNull();
    expect(r.dias).toBeNull();
  });

  it("a same-day sign-up with no account and no package gets the same fresh-arrival estado", () => {
    const r = derivarLifecycle(
      fila({ vence: null, pendienteOnline: false, tieneCuenta: false, ultimaVisita: null, alta: HOY }),
      HOY,
    );
    expect(r.estado).toBe("sin_paquete");
  });

  it("is reconciled with AÚN A TIEMPO by construction — a no-package row can never also be aun_a_tiempo", () => {
    const r = derivarLifecycle(fila({ vence: null, pendienteOnline: true }), HOY);
    expect(r.tile).not.toBe("aun_a_tiempo");
  });

  it("HIGH RISK CASE (#223 finding 1): a pendienteOnline row with a real 40-día-past vence is estado VENCIDO, not sin_paquete", () => {
    // The real producer (derive.ts esRegistroOnlinePendiente) marks
    // pendienteOnline from the OLD estado's "sin_clases", which covers BOTH
    // no-package AND expired-by-date — so this shape is real, not synthetic.
    const r = derivarLifecycle(
      fila({ vence: haceDias(40), clases: 0, pendienteOnline: true, tieneCuenta: true }),
      HOY,
    );
    expect(r.estado).toBe("vencido");
    expect(r.dias).toBe(-40);
    // Excluded from AÚN A TIEMPO via tieneCuenta (structural reconciliation),
    // not because pendienteOnline forces sin_paquete (the false assumption).
    expect(r.tile).toBeNull();
  });
});

describe("derivarLifecycle — la insignia ausente: pisos, no fugas (S9/A9)", () => {
  it("a numeric last visit under AUSENTE_DIAS is not ausente; at/over it, it is", () => {
    expect(derivarLifecycle(fila({ ultimaVisita: haceDias(14) }), HOY).ausente).toBe(false);
    expect(derivarLifecycle(fila({ ultimaVisita: haceDias(15) }), HOY).ausente).toBe(true);
  });

  it("BOUGHT, NEVER CAME: a null last-visit on a package old enough counts as absent", () => {
    const r = derivarLifecycle(
      fila({ vence: enDias(10), clases: 8, ultimaVisita: null, alta: haceDias(20) }),
      HOY,
    );
    expect(r.estado).toBe("vigente");
    expect(r.ausente).toBe(true);
  });

  it("a same-day sign-up with a null last-visit is NOT yet ausente", () => {
    const r = derivarLifecycle(fila({ vence: HOY, clases: 8, ultimaVisita: null, alta: HOY }), HOY);
    expect(r.ausente).toBe(false);
  });

  it("does NOT vanish the day the package lapses (the self-erasing bug, S9)", () => {
    const visitas = { ultimaVisita: haceDias(24), ultimaVisitaConsumida: haceDias(24) } as const;
    const vigente = derivarLifecycle(fila({ vence: enDias(12), clases: 8, ...visitas }), HOY);
    const vencido = derivarLifecycle(fila({ vence: haceDias(1), clases: 8, ...visitas }), HOY);
    expect(vigente.estado).toBe("vigente");
    expect(vencido.estado).toBe("vencido");
    expect(vigente.ausente).toBe(true);
    expect(vencido.ausente).toBe(true); // same absence fact, regardless of estado
  });
});

describe("derivarLifecycle — urgencia integration (#223 finding 3)", () => {
  it("a VENCIDO row's urgencia is ok regardless of how long ago it expired", () => {
    expect(derivarLifecycle(fila({ vence: haceDias(1), clases: 8 }), HOY).urgencia).toBe("ok");
    expect(derivarLifecycle(fila({ vence: haceDias(40), clases: 8 }), HOY).urgencia).toBe("ok");
  });

  it("a sin_paquete row's urgencia is ok — nothing to be urgent about", () => {
    expect(derivarLifecycle(fila({ vence: null, pendienteOnline: true }), HOY).urgencia).toBe("ok");
  });

  it("a SIN CLASES row (días to spare, clases exhausted) still reads crítico via the clases dimension — the floor is about vencido, not sin_clases", () => {
    expect(derivarLifecycle(fila({ vence: enDias(29), clases: 0 }), HOY).urgencia).toBe("critico");
  });

  it("a one-off pass's spent clases never drive urgencia — only días can", () => {
    const r = derivarLifecycle(fila({ vence: enDias(20), clases: 0, esPaseSuelto: true }), HOY);
    expect(r.urgencia).toBe("ok"); // días=20 alone reads ok; clases=0 must NOT force critico
  });
});

describe("ordenarLifecycle — actionable → current → expired, most-recently-expired first", () => {
  it("orders actionable before current before expired", () => {
    const actionable = derivarLifecycle(fila({ vence: enDias(3), clases: 8 }), HOY);
    const current = derivarLifecycle(fila({ vence: enDias(20), clases: 8 }), HOY);
    const expired = derivarLifecycle(fila({ vence: haceDias(5), clases: 8 }), HOY);
    const orden = ordenarLifecycle([expired, current, actionable]);
    expect(orden).toEqual([actionable, current, expired]);
  });

  it("expired rows sort most-recently-expired first", () => {
    const reciente = derivarLifecycle(fila({ vence: haceDias(1), clases: 8 }), HOY);
    const viejo = derivarLifecycle(fila({ vence: haceDias(44), clases: 8 }), HOY);
    const orden = ordenarLifecycle([viejo, reciente]);
    expect(orden).toEqual([reciente, viejo]);
  });

  it("pendienteOnline never sorts below the longest-dead row", () => {
    const online = derivarLifecycle(fila({ vence: null, pendienteOnline: true }), HOY);
    const viejo = derivarLifecycle(fila({ vence: haceDias(44), clases: 8 }), HOY);
    const orden = ordenarLifecycle([viejo, online]);
    expect(orden[0]).toBe(online);
  });

  it("within POR RENOVAR, soonest expiry sorts first", () => {
    const dia1 = derivarLifecycle(fila({ vence: enDias(1), clases: 8 }), HOY);
    const dia9 = derivarLifecycle(fila({ vence: enDias(9), clases: 8 }), HOY);
    const orden = ordenarLifecycle([dia9, dia1]);
    expect(orden).toEqual([dia1, dia9]);
  });

  it("HIGH (#223 finding 1): a pendienteOnline row lapsed 40 días sorts actionable, never below a plain expired row", () => {
    const lapsedOnline = derivarLifecycle(
      fila({ vence: haceDias(40), clases: 0, pendienteOnline: true, tieneCuenta: true }),
      HOY,
    );
    const plainExpired = derivarLifecycle(fila({ vence: haceDias(10), clases: 0 }), HOY);
    const orden = ordenarLifecycle([plainExpired, lapsedOnline]);
    expect(orden[0]).toBe(lapsedOnline); // read from fila.pendienteOnline, not inferred from vence
  });

  it("LOW (#223 finding 5): a SIN CLASES row with días to spare sorts by its binding-axis urgency, not stranded behind a merely-urgente días-bound row", () => {
    const sinClasesLejos = derivarLifecycle(fila({ vence: enDias(29), clases: 0 }), HOY); // critico via clases
    const diasBoundUrgente = derivarLifecycle(fila({ vence: enDias(5), clases: 8 }), HOY); // urgente via días (29 > 5)
    const orden = ordenarLifecycle([diasBoundUrgente, sinClasesLejos]);
    // Raw-día sorting would strand sinClasesLejos (29 días) behind
    // diasBoundUrgente (5 días) even though it cannot train today.
    expect(orden[0]).toBe(sinClasesLejos);
  });
});

describe("contarLifecycle — POR RENOVAR buckets always sum to the headline (clases-arm bucket sum)", () => {
  it("a clases-bound member (1 clase, 18 días) lands in the CLASES bucket, and buckets sum to total", () => {
    const filas = [
      derivarLifecycle(fila({ vence: enDias(0), clases: 8 }), HOY), // hoy
      derivarLifecycle(fila({ vence: enDias(1), clases: 8 }), HOY), // manana
      derivarLifecycle(fila({ vence: enDias(3), clases: 8 }), HOY), // dosATres
      derivarLifecycle(fila({ vence: enDias(5), clases: 8 }), HOY), // cuatroACinco
      derivarLifecycle(fila({ vence: enDias(10), clases: 8 }), HOY), // seisOMas
      derivarLifecycle(fila({ vence: enDias(18), clases: 1 }), HOY), // clases — outside every día bucket
      derivarLifecycle(fila({ vence: enDias(29), clases: 0 }), HOY), // sin_clases — also the clases bucket
    ];
    const { porRenovar } = contarLifecycle(filas);
    expect(porRenovar.total).toBe(7);
    expect(porRenovar.cubos).toEqual({
      hoy: 1,
      manana: 1,
      dosATres: 1,
      cuatroACinco: 1,
      seisOMas: 1,
      clases: 2,
    });
    const sumaCubos = Object.values(porRenovar.cubos).reduce((a, b) => a + b, 0);
    expect(sumaCubos).toBe(porRenovar.total);
  });

  it("a one-off pass never inflates the clases bucket (the '22 vs 4' bug, #184)", () => {
    const filas = [
      derivarLifecycle(fila({ vence: enDias(20), clases: 0, esPaseSuelto: true }), HOY),
      derivarLifecycle(fila({ vence: enDias(15), clases: 0, esPaseSuelto: true }), HOY),
    ];
    const { porRenovar } = contarLifecycle(filas);
    // Neither reaches the tile at all: días are outside RENOVACION_DIAS OR
    // the pass's spent clases are inert — see the POR RENOVAR describe block.
    expect(porRenovar.total).toBe(0);
    expect(porRenovar.cubos.clases).toBe(0);
  });
});

describe("contarLifecycle — el conteo compartido", () => {
  it("counts aunATiempo and pendienteOnline independently of POR RENOVAR", () => {
    const filas = [
      derivarLifecycle(fila({ vence: haceDias(3), clases: 8 }), HOY), // aun a tiempo
      derivarLifecycle(fila({ vence: null, pendienteOnline: true }), HOY),
      derivarLifecycle(fila({ vence: enDias(20), clases: 8 }), HOY), // neither
    ];
    const conteos = contarLifecycle(filas);
    expect(conteos.aunATiempo.total).toBe(1);
    expect(conteos.pendienteOnline).toBe(1);
    expect(conteos.porRenovar.total).toBe(0);
  });

  it("HIGH (#223 finding 1): a lapsed pendienteOnline row counts ONCE — pendienteOnline only, never also aunATiempo/porRenovar (one verdict)", () => {
    const filas = [
      derivarLifecycle(
        fila({ vence: haceDias(40), clases: 0, pendienteOnline: true, tieneCuenta: true }),
        HOY,
      ),
    ];
    const conteos = contarLifecycle(filas);
    expect(conteos.pendienteOnline).toBe(1);
    expect(conteos.aunATiempo.total).toBe(0);
    expect(conteos.porRenovar.total).toBe(0);
  });

  it("MEDIUM (#223 finding 4): vigentes/total feed the header ratio (story 19) — the one VIGENTE number, never a second inline filter count", () => {
    const filas = [
      derivarLifecycle(fila({ vence: enDias(20), clases: 8 }), HOY), // vigente
      derivarLifecycle(fila({ vence: enDias(3), clases: 8 }), HOY), // vigente, also por_renovar
      derivarLifecycle(fila({ vence: haceDias(5), clases: 8 }), HOY), // vencido
      derivarLifecycle(fila({ vence: enDias(20), clases: 0 }), HOY), // sin_clases
      derivarLifecycle(fila({ vence: null, pendienteOnline: true }), HOY), // sin_paquete
    ];
    const conteos = contarLifecycle(filas);
    expect(conteos.vigentes).toBe(2);
    expect(conteos.total).toBe(5);
  });
});

describe("lifecycle engine — forge-shaped mix (finite packs, ilimitado, drop-ins, pendienteOnline, lapsed)", () => {
  // forge is the one organically-used gym on the platform, and its usage
  // skews heavily to pasa-lista / class visits (owner-is-dev memory) — this
  // roster leans on finite class packs rather than the /proto fixture's
  // all-ilimitado blind spot (#222's named fixture debt).
  const clasesPackMidCycle = fila({
    vence: enDias(15),
    clases: 6,
    ultimaVisita: haceDias(1),
    ultimaVisitaConsumida: haceDias(1),
    alta: haceDias(90),
  });
  const clasesPackCasiEnCero = fila({
    vence: enDias(20),
    clases: 1,
    ultimaVisita: HOY,
    ultimaVisitaConsumida: HOY,
    alta: haceDias(60),
  });
  const clasesPackAgotado = fila({
    vence: enDias(9),
    clases: 0,
    ultimaVisita: haceDias(2),
    ultimaVisitaConsumida: haceDias(2),
    alta: haceDias(40),
  });
  const ilimitadoPorVencer = fila({
    vence: enDias(4),
    clases: "ilimitado",
    ultimaVisita: haceDias(1),
    ultimaVisitaConsumida: haceDias(1),
    alta: haceDias(300),
  });
  const hectorAusenteVigente = fila({
    vence: enDias(12),
    clases: "ilimitado",
    ultimaVisita: haceDias(24),
    ultimaVisitaConsumida: haceDias(24),
    alta: haceDias(400),
  });
  const paseSueltoGastado = fila({
    vence: enDias(18),
    clases: 0,
    esPaseSuelto: true,
    ultimaVisita: haceDias(12),
    ultimaVisitaConsumida: haceDias(12),
    alta: haceDias(12),
  });
  const recienVencidoSinCuenta = fila({
    vence: haceDias(3),
    clases: 0,
    ultimaVisita: haceDias(3),
    ultimaVisitaConsumida: haceDias(3),
    alta: haceDias(120),
  });
  const recienVencidoConCuenta = fila({
    vence: haceDias(3),
    clases: 0,
    tieneCuenta: true,
    ultimaVisita: haceDias(3),
    ultimaVisitaConsumida: haceDias(3),
    alta: haceDias(120),
  });
  const largoMuerto = fila({
    vence: haceDias(44),
    clases: 0,
    ultimaVisita: haceDias(49),
    ultimaVisitaConsumida: haceDias(49),
    alta: haceDias(500),
  });
  const registroOnline = fila({
    vence: null,
    pendienteOnline: true,
    tieneCuenta: true,
    ultimaVisita: null,
    alta: haceDias(1),
  });

  const ROSTER = [
    clasesPackMidCycle,
    clasesPackCasiEnCero,
    clasesPackAgotado,
    ilimitadoPorVencer,
    hectorAusenteVigente,
    paseSueltoGastado,
    recienVencidoSinCuenta,
    recienVencidoConCuenta,
    largoMuerto,
    registroOnline,
  ];

  it("orders the fresh-clases-bound row and the online registrant ahead of the long-dead row", () => {
    const derivadas = ROSTER.map((f) => derivarLifecycle(f, HOY));
    const orden = ordenarLifecycle(derivadas);
    const idxViejo = orden.findIndex((f) => f.fila === largoMuerto);
    const idxOnline = orden.findIndex((f) => f.fila === registroOnline);
    const idxClasesBound = orden.findIndex((f) => f.fila === clasesPackCasiEnCero);
    expect(idxOnline).toBeLessThan(idxViejo);
    expect(idxClasesBound).toBeLessThan(idxViejo);
    expect(idxViejo).toBe(orden.length - 1); // the deadest row is last, not first
  });

  it("counts the tiles and the online rail over the mixed roster", () => {
    const derivadas = ROSTER.map((f) => derivarLifecycle(f, HOY));
    const conteos = contarLifecycle(derivadas);
    // clasesPackCasiEnCero (clases) + clasesPackAgotado (sin_clases) + ilimitadoPorVencer (días)
    expect(conteos.porRenovar.total).toBe(3);
    expect(conteos.porRenovar.cubos.clases).toBe(2); // casiEnCero + agotado
    // recienVencidoSinCuenta only — paseSueltoGastado excluded (one-off),
    // recienVencidoConCuenta excluded (app account), largoMuerto past día 16.
    expect(conteos.aunATiempo.total).toBe(1);
    expect(conteos.pendienteOnline).toBe(1);
    // vigentes (#223 finding 4): midCycle + casiEnCero + porVencer + hector + paseSueltoGastado.
    // agotado is sin_clases, the three vencido rows + registroOnline are not.
    expect(conteos.vigentes).toBe(5);
    expect(conteos.total).toBe(10);
  });

  it("flags Hector — paid up, vigente, but 24 días unseen — as ausente", () => {
    expect(derivarLifecycle(hectorAusenteVigente, HOY).ausente).toBe(true);
  });
});
