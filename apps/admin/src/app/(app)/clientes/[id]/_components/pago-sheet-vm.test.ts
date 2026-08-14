import { describe, expect, it } from "vitest";

import {
  dentroDeVentanaEliminar,
  montoEditado,
  previewEliminarVenta,
  vigenciaDiasVenta,
} from "./pago-sheet-vm";

/** The ruling's own worked example (#267.6): an 8-clase / 30-día sale of $850 in agosto,
 *  on a balance of 14 clases expiring 8 oct. */
const EJEMPLO = {
  clases: 8,
  dias: 30,
  clasesRestantes: 14,
  vence: "2026-10-08",
  monto: 850,
  mes: "agosto",
};

describe("previewEliminarVenta", () => {
  it("states the ruling's exact outcome: what leaves, where it lands, and the money out of that month", () => {
    expect(previewEliminarVenta(EJEMPLO)).toBe(
      "Se restarán 8 clases y 30 días → quedará en 6 clases, vence 8 sep. Se restarán $850 de los ingresos de agosto.",
    );
  });

  it("floors the balance at zero and SAYS so (#267.4) — used classes are never a refusal", () => {
    expect(previewEliminarVenta({ ...EJEMPLO, clasesRestantes: 2 })).toBe(
      "Se restarán 8 clases y 30 días → quedará en 0 clases, vence 8 sep. Se restarán $850 de los ingresos de agosto.",
    );
  });

  it("drops the clases fragments for an ilimitado sale — it subtracts days only", () => {
    expect(previewEliminarVenta({ ...EJEMPLO, clases: null })).toBe(
      "Se restarán 30 días → vence 8 sep. Se restarán $850 de los ingresos de agosto.",
    );
  });

  it("claims no resulting count against an ilimitado balance", () => {
    expect(previewEliminarVenta({ ...EJEMPLO, clasesRestantes: null })).toBe(
      "Se restarán 8 clases y 30 días → vence 8 sep. Se restarán $850 de los ingresos de agosto.",
    );
  });

  it("drops the días fragment at 0 days and the vence fragment when there is none", () => {
    expect(previewEliminarVenta({ ...EJEMPLO, dias: 0, vence: null })).toBe(
      "Se restarán 8 clases → quedará en 6 clases. Se restarán $850 de los ingresos de agosto.",
    );
  });

  it("omits vence at 0 days even when there IS one — the date does not move, so it is not an outcome", () => {
    expect(previewEliminarVenta({ ...EJEMPLO, dias: 0 })).toBe(
      "Se restarán 8 clases → quedará en 6 clases. Se restarán $850 de los ingresos de agosto.",
    );
  });

  it("says only what leaves the month when the sale granted nothing to claw back", () => {
    expect(previewEliminarVenta({ ...EJEMPLO, clases: null, dias: 0 })).toBe(
      "Se restarán $850 de los ingresos de agosto.",
    );
  });

  it("counts a pase suelto in the singular — '1 clase', never '1 clases'", () => {
    expect(previewEliminarVenta({ ...EJEMPLO, clases: 1, clasesRestantes: 2, monto: 150 })).toBe(
      "Se restarán 1 clase y 30 días → quedará en 1 clase, vence 8 sep. Se restarán $150 de los ingresos de agosto.",
    );
  });
});

describe("dentroDeVentanaEliminar", () => {
  const CREATED = "2026-08-01T18:00:00Z";

  it("keeps the affordance inside 30 days of REGISTRATION", () => {
    expect(dentroDeVentanaEliminar(CREATED, new Date("2026-08-31T17:59:00Z"))).toBe(true);
  });
  it("withdraws it past the window (#266.2 — no in-product recourse, the runbook is)", () => {
    expect(dentroDeVentanaEliminar(CREATED, new Date("2026-08-31T18:00:01Z"))).toBe(false);
  });
});

describe("vigenciaDiasVenta", () => {
  it("is a flat 30 for a 'mes' package (ruling C1)", () => {
    expect(vigenciaDiasVenta("mes", null)).toBe(30);
  });
  it("is the stored días otherwise, and 0 when there are none", () => {
    expect(vigenciaDiasVenta("dias", 45)).toBe(45);
    expect(vigenciaDiasVenta("dias", null)).toBe(0);
  });
});

describe("montoEditado", () => {
  it("returns the integer the action will send", () => {
    expect(montoEditado(" 850 ")).toBe(850);
  });
  it("refuses anything editarVentaSchema would reject, so GUARDAR never fires a doomed write", () => {
    expect(montoEditado("")).toBeNull();
    expect(montoEditado("0")).toBeNull();
    expect(montoEditado("850.5")).toBeNull();
    expect(montoEditado("abc")).toBeNull();
  });

  it("has NO upper cap — a paquete's precio is unbounded, so a high-value sale stays correctable", () => {
    expect(montoEditado("150000")).toBe(150_000);
  });
});
