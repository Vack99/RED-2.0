import { describe, expect, it } from "vitest";

import { CUSTOM_VACIO, PERSONALIZADO, type CustomForm } from "../../../vender/_components/vender-vm";
import {
  clawbackPisaCero,
  dentroDeVentanaEliminar,
  fechaEditada,
  fechaSeed,
  inicioMinIso,
  montoEditado,
  previewEliminarVenta,
  previewRederivarVenta,
  rederivaSaldo,
  swapDirty,
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

describe("fechaEditada — the sold date travels only when it CHANGED", () => {
  it("omits the arg for the seeded date, so the RPC keeps the stored timestamp", () => {
    expect(fechaEditada("2026-08-10", "2026-08-10")).toBeUndefined();
  });

  it("sends the picked ISO day once the operator moves it", () => {
    expect(fechaEditada("2026-08-10", "2026-08-03")).toBe("2026-08-03");
  });
});

describe("picker bounds — the SAME floor as vender's backdate", () => {
  it("is always hoy − 30 (the alta floor was dropped, owner ruling 2026-08-14)", () => {
    expect(inicioMinIso("2026-08-14")).toBe("2026-07-15");
  });
});

describe("fechaSeed — the calendar's displayed sel, clamped display-only (#269 fast-follow)", () => {
  it("passes an in-range fecha through untouched", () => {
    expect(fechaSeed("2026-08-01", "2026-07-15", "2026-08-14")).toBe("2026-08-01");
  });

  it("reverts a >30d-old sale's fecha to hoy, so the calendar doesn't open on a dead month", () => {
    expect(fechaSeed("2026-05-01", "2026-07-15", "2026-08-14")).toBe("2026-08-14");
  });
});

// ── Package swap (paquete-swap spec §6.3) ───────────────────────────

describe("clawbackPisaCero — the delete gate's floor-clip predicate (ruling 3)", () => {
  it("refuses strictly below zero", () => {
    expect(clawbackPisaCero(8, 3)).toBe(true);
  });

  it("allows landing on EXACTLY zero — the boundary #267.4 already shipped", () => {
    expect(clawbackPisaCero(8, 8)).toBe(false);
  });

  it("allows a balance comfortably above zero", () => {
    expect(clawbackPisaCero(8, 10)).toBe(false);
  });

  it("never trips for an ilimitado sale (clases null)", () => {
    expect(clawbackPisaCero(null, 3)).toBe(false);
  });

  it("never trips for an ilimitado balance (clasesRestantes null)", () => {
    expect(clawbackPisaCero(8, null)).toBe(false);
  });
});

describe("rederivaSaldo — mirrors editar_venta's v_cambio_grant OR v_cambio_fecha (D0.5)", () => {
  const BASE = {
    ventaClases: 8,
    ventaVigTipo: "dias" as const,
    ventaVigDias: 20,
    nuevoClases: 8,
    nuevoVigTipo: "dias" as const,
    nuevoVigDias: 20,
    fechaOriginalIso: "2026-08-10",
    fechaIso: "2026-08-10",
  };

  it("is false when neither the grant nor the fecha moved — the cheap path (monto/metodo-only)", () => {
    expect(rederivaSaldo(BASE)).toBe(false);
  });

  it("is true when clases changed", () => {
    expect(rederivaSaldo({ ...BASE, nuevoClases: 12 })).toBe(true);
  });

  it("is true when only the vigencia TYPE changed, even at the same collapsed day count", () => {
    expect(rederivaSaldo({ ...BASE, ventaVigTipo: "mes", ventaVigDias: null, nuevoVigTipo: "dias", nuevoVigDias: 30 })).toBe(
      true,
    );
  });

  it("is true when vigencia_dias changed", () => {
    expect(rederivaSaldo({ ...BASE, nuevoVigDias: 30 })).toBe(true);
  });

  it("is true when only the fecha moved (a fecha-only correction still re-derives)", () => {
    expect(rederivaSaldo({ ...BASE, fechaIso: "2026-08-03" })).toBe(true);
  });

  it("is false for a same-value package re-pick (a rename-only swap never re-derives)", () => {
    expect(rederivaSaldo({ ...BASE, nuevoClases: 8, nuevoVigTipo: "dias", nuevoVigDias: 20 })).toBe(false);
  });
});

describe("previewRederivarVenta — mirrors editar_venta §1.2 steps 14-15 exactly", () => {
  it("is an exact identity when nothing clamps (D0.4's own worked example: balance 3, old grant 8, new grant 8)", () => {
    expect(
      previewRederivarVenta({
        clasesRestantes: 3,
        vence: "2026-08-21",
        viejo: { clases: 8, dias: 20 },
        nuevo: { clases: 8, dias: 20 },
        fechaIso: "2026-08-01",
      }),
    ).toBe("El saldo se recalcula: quedará en 3 clases · vence 21 ago.");
  });

  it("clamps only the FINAL number, not the intermediate (D0.4 S3: balance 3, old grant 8, swap to 12 → 7, not 12)", () => {
    expect(
      previewRederivarVenta({
        clasesRestantes: 3,
        vence: "2026-08-21",
        viejo: { clases: 8, dias: 20 },
        nuevo: { clases: 12, dias: 30 },
        fechaIso: "2026-08-01",
      }),
    ).toBe("El saldo se recalcula: quedará en 7 clases · vence 31 ago.");
  });

  it("floors the final number at zero, never negative (D0.4 S4: balance 3, old grant 8, swap to 4 → 0)", () => {
    expect(
      previewRederivarVenta({
        clasesRestantes: 3,
        vence: "2026-08-21",
        viejo: { clases: 8, dias: 20 },
        nuevo: { clases: 4, dias: 10 },
        fechaIso: "2026-08-01",
      }),
    ).toBe("El saldo se recalcula: quedará en 0 clases · vence 11 ago.");
  });

  it("discards the base entirely once the base vence is behind the re-grant date (D0.9's expired-restart)", () => {
    expect(
      previewRederivarVenta({
        clasesRestantes: 3,
        // base vence (vence − viejo.dias) lands on 2026-08-01, BEFORE the re-grant date below.
        vence: "2026-08-21",
        viejo: { clases: 8, dias: 20 },
        nuevo: { clases: 8, dias: 20 },
        fechaIso: "2026-08-15",
      }),
    ).toBe("El saldo se recalcula: quedará en 8 clases · vence 4 sep.");
  });

  it("drops the clases fragment when the NEW package is itself ilimitado", () => {
    expect(
      previewRederivarVenta({
        clasesRestantes: 5,
        vence: "2026-08-21",
        viejo: { clases: 8, dias: 20 },
        nuevo: { clases: null, dias: 20 },
        fechaIso: "2026-08-01",
      }),
    ).toBe("El saldo se recalcula: vence 21 ago.");
  });

  it("does NOT drop the clases fragment for an ilimitado CURRENT balance swapping onto a finite package", () => {
    expect(
      previewRederivarVenta({
        clasesRestantes: null,
        vence: "2026-08-21",
        viejo: { clases: 8, dias: 20 },
        nuevo: { clases: 12, dias: 15 },
        fechaIso: "2026-08-01",
      }),
    ).toBe("El saldo se recalcula: quedará en 12 clases · vence 16 ago.");
  });
});

describe("swapDirty — the PAQUETE section's own dirty bit", () => {
  const VALIDO: CustomForm = { nombre: "Promo Verano", precio: "500", clases: "10", ilimitado: false, dias: "20" };

  it("is false when nothing is picked", () => {
    expect(swapDirty(null, CUSTOM_VACIO)).toBe(false);
  });

  it("is true the instant a registrado tile is picked, regardless of the (unused) custom form", () => {
    expect(swapDirty("paquete-1", CUSTOM_VACIO)).toBe(true);
  });

  it("is false for PERSONALIZADO while its form is still incomplete", () => {
    expect(swapDirty(PERSONALIZADO, CUSTOM_VACIO)).toBe(false);
  });

  it("is true for PERSONALIZADO once its form validates", () => {
    expect(swapDirty(PERSONALIZADO, VALIDO)).toBe(true);
  });
});
