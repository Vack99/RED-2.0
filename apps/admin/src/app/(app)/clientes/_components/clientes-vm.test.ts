import { describe, expect, it } from "vitest";

import type { ClienteRosterDTO } from "@gym/data/server/clientes";
import { derivarVistaRoster } from "./clientes-vm";

// These tests exercise the WIRING (does derivarVistaRoster call the real
// engine with the right facts?) — the engine's own ordering/estado/urgencia
// rules are already pinned by packages/domain/src/lifecycle.test.ts (51+
// cases) and are not re-asserted here (per #227's testing note).

const BASE: ClienteRosterDTO = {
  id: "base",
  nombre: "Base Cliente",
  tel: "6141234567",
  inicial: "B",
  paquete: "8 clases",
  estado: "vigente",
  diasRest: 20,
  venceDisplay: "20 ago",
  clasesRest: 8,
  clasesRestLabel: "8",
  asistEsteMes: 3,
  invitacion: { estado: "sin_email", badge: "Sin email" },
  pendienteOnline: false,
  esPaseSuelto: false,
};

function mk(id: string, overrides: Partial<ClienteRosterDTO>): ClienteRosterDTO {
  return { ...BASE, id, nombre: overrides.nombre ?? id, ...overrides };
}

describe("derivarVistaRoster — ordering (wiring onto ordenarLifecycle)", () => {
  it("orders actionable (por renovar) before current before expired", () => {
    const actionable = mk("a", { diasRest: 5 }); // <= RENOVACION_DIAS
    const current = mk("c", { diasRest: 20 });
    const expired = mk("e", { estado: "vencido", diasRest: -10, clasesRest: 0, clasesRestLabel: "0" });

    const { filas } = derivarVistaRoster([expired, current, actionable]);
    expect(filas.map((f) => f.c.id)).toEqual(["a", "c", "e"]);
  });

  it("#227 F1: a lapsed account-holder (200 días vencido) is plain vencido — it does NOT outrank a vence-hoy vigente member, and a sin_paquete account-holder (a genuine fresh arrival) still leads", () => {
    // Fixtures reflect what the FIXED esRegistroOnlinePendiente (#227 F1,
    // packages/data/src/server/derive.ts) actually produces now: an
    // account-holder whose package merely lapsed is pendienteOnline:false —
    // only a never-bought sin_paquete row gets that flag. Before the fix,
    // BOTH `vencido200` here would have read pendienteOnline:true and topped
    // the list ahead of `venceHoy` — the "longest-dead first and loudest"
    // defect spec #222 opens with.
    const venceHoy = mk("hoy", { estado: "vigente", diasRest: 0 });
    const vencido200 = mk("viejo", {
      estado: "vencido",
      diasRest: -200,
      clasesRest: 0,
      clasesRestLabel: "0",
      pendienteOnline: false,
      invitacion: { estado: "cuenta_activa", badge: "Cuenta activa" }, // HAS an account…
    });
    const fresco = mk("fresco", {
      estado: "sin_paquete",
      diasRest: 0,
      clasesRest: 0,
      clasesRestLabel: "0",
      pendienteOnline: true, // …but only THIS row (never bought) is pendienteOnline
      invitacion: { estado: "cuenta_activa", badge: "Cuenta activa" },
    });

    const { filas } = derivarVistaRoster([vencido200, venceHoy, fresco]);
    expect(filas.map((f) => f.c.id)).toEqual(["fresco", "hoy", "viejo"]);
  });
});

describe("derivarVistaRoster — diasDesdeVencido", () => {
  it("is the positive days-since-expiry for a vencido row", () => {
    const e = mk("e", { estado: "vencido", diasRest: -12, clasesRest: 0, clasesRestLabel: "0" });
    const { filas } = derivarVistaRoster([e]);
    expect(filas[0]?.diasDesdeVencido).toBe(12);
  });

  it("is null for a non-vencido row", () => {
    const v = mk("v", { estado: "vigente", diasRest: 5 });
    const { filas } = derivarVistaRoster([v]);
    expect(filas[0]?.diasDesdeVencido).toBeNull();
  });
});

describe("derivarVistaRoster — vinculante numeral", () => {
  it("binds on clases when 1 clase remains with 25 días left", () => {
    const c = mk("c", { estado: "vigente", diasRest: 25, clasesRest: 1, clasesRestLabel: "1" });
    const { filas } = derivarVistaRoster([c]);
    expect(filas[0]?.vinculante).toBe("clases");
  });
});

describe("derivarVistaRoster — pase suelto blinding (#227 F2/F3)", () => {
  it("a spent one-off pass (0 clases, días left) reads urgencia ok and binds on días — the blinded clases axis never fires crítico", () => {
    const spent = mk("p", {
      estado: "vigente",
      diasRest: 20,
      clasesRest: 0,
      clasesRestLabel: "0",
      esPaseSuelto: true,
    });
    const { filas } = derivarVistaRoster([spent]);
    expect(filas[0]?.urgencia).toBe("ok");
    expect(filas[0]?.vinculante).toBe("dias");
    expect(filas[0]?.renovar).toBe(false); // clases arm exempts pase suelto (esPorRenovar)
  });

  it("does not jump ahead of a genuinely-urgent row in the SAME (current) tier via NIVEL_RANGO — unblinded, the spent pass's raw 0 clases would read crítico and sort FIRST; blinded, it correctly sorts LAST", () => {
    // Both rows are outside POR RENOVAR (días > RENOVACION_DIAS for both) — the
    // same "current" ordering tier, so this isolates the urgencia-key ordering
    // from the group split (that's the prior test's job).
    const spent = mk("p", { estado: "vigente", diasRest: 20, clasesRest: 0, clasesRestLabel: "0", esPaseSuelto: true });
    const pronto = mk("g", { estado: "vigente", diasRest: 12, clasesRest: 8, clasesRestLabel: "8" }); // día 12 <= URGENCIA_DIAS.pronto
    const { filas } = derivarVistaRoster([spent, pronto]);
    expect(filas.map((f) => f.c.id)).toEqual(["g", "p"]);
  });
});

describe("derivarVistaRoster — nombrePlegado", () => {
  it("diacritic-folds the candidate name", () => {
    const c = mk("c", { nombre: "Chávez" });
    const { filas } = derivarVistaRoster([c]);
    expect(filas[0]?.nombrePlegado).toBe("chavez");
  });
});

describe("derivarVistaRoster — conteos (header ratio + filter chips)", () => {
  it("matches hand counts on a small mixed roster", () => {
    const vigente = mk("v", { estado: "vigente", diasRest: 20 });
    const porRenovar = mk("r", { estado: "vigente", diasRest: 3 });
    const vencido = mk("x", { estado: "vencido", diasRest: -5, clasesRest: 0, clasesRestLabel: "0" });
    const online = mk("o", {
      estado: "sin_paquete",
      diasRest: 0,
      clasesRest: 0,
      clasesRestLabel: "0",
      pendienteOnline: true,
      invitacion: { estado: "cuenta_activa", badge: "Cuenta activa" },
    });

    const { conteos } = derivarVistaRoster([vigente, porRenovar, vencido, online]);
    expect(conteos.vigentes).toBe(2); // vigente + porRenovar (still "vigente" estado)
    expect(conteos.total).toBe(4);
    expect(conteos.porRenovar.total).toBe(1);
    expect(conteos.pendienteOnline).toBe(1);
  });
});
