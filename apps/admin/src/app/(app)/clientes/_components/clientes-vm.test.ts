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

  it("a lapsed online registrant (pendienteOnline + vencido) never sorts below the merely-expired (S4)", () => {
    const plainExpired = mk("e1", { estado: "vencido", diasRest: -3, clasesRest: 0, clasesRestLabel: "0" });
    const lapsedOnline = mk("e2", {
      estado: "vencido",
      diasRest: -30,
      clasesRest: 0,
      clasesRestLabel: "0",
      pendienteOnline: true,
      invitacion: { estado: "cuenta_activa", badge: "Cuenta activa" },
    });

    const { filas } = derivarVistaRoster([plainExpired, lapsedOnline]);
    expect(filas.map((f) => f.c.id)).toEqual(["e2", "e1"]);
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
