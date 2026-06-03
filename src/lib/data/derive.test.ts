import { describe, expect, it } from "vitest";

import {
  clasesDenom,
  derivarCliente,
  derivarPaseCliente,
  diasDenom,
  gaugeFill,
  shapeFicha,
  type ClienteFacts,
  type FichaAsistRow,
  type FichaClienteRow,
  type FichaVentaRow,
} from "./derive";

// Fixed "today" so the derivation is deterministic (months are 0-based).
const HOY = new Date(2026, 4, 27); // 27 May 2026

function facts(over: Partial<ClienteFacts> = {}): ClienteFacts {
  return {
    id: "c1",
    nombre: "Andrea Castro",
    tel: "614 218 3401",
    paquete_nombre: "8 clases",
    clases_restantes: 5,
    vence: "2026-06-16",
    ...over,
  };
}

describe("derivarCliente", () => {
  it("is activo with classes and time to spare", () => {
    const d = derivarCliente(facts(), HOY, 3);
    expect(d.estado).toBe("activo");
    expect(d.diasRest).toBe(20);
    expect(d.clasesRest).toBe(5);
    expect(d.clasesRestLabel).toBe("5");
    expect(d.venceDisplay).toBe("16 jun");
    expect(d.inicial).toBe("AC");
    expect(d.asistEsteMes).toBe(3);
  });

  it("is por_vencer at <= 5 days left", () => {
    const d = derivarCliente(facts({ vence: "2026-05-30" }), HOY, 0);
    expect(d.diasRest).toBe(3);
    expect(d.estado).toBe("por_vencer");
  });

  it("is por_vencer at <= 2 classes left", () => {
    const d = derivarCliente(facts({ clases_restantes: 2, vence: "2026-06-20" }), HOY, 0);
    expect(d.estado).toBe("por_vencer");
    expect(d.clasesRest).toBe(2);
  });

  it("is sin_clases when out of classes", () => {
    const d = derivarCliente(facts({ clases_restantes: 0, vence: "2026-06-20" }), HOY, 0);
    expect(d.estado).toBe("sin_clases");
  });

  it("forfeits remaining classes once expired (read-time)", () => {
    const d = derivarCliente(facts({ clases_restantes: 5, vence: "2026-05-25" }), HOY, 0);
    expect(d.diasRest).toBe(-2);
    expect(d.clasesRest).toBe(0); // forfeited
    expect(d.estado).toBe("sin_clases");
  });

  it("keeps ilimitado active", () => {
    const d = derivarCliente(
      facts({ clases_restantes: null, paquete_nombre: "Ilimitado", vence: "2026-06-30" }),
      HOY,
      9,
    );
    expect(d.clasesRest).toBe("ilimitado");
    expect(d.clasesRestLabel).toBe("∞");
    expect(d.estado).toBe("activo");
  });

  it("never forfeits ilimitado but still expires by date", () => {
    const d = derivarCliente(
      facts({ clases_restantes: null, paquete_nombre: "Ilimitado", vence: "2026-05-25" }),
      HOY,
      0,
    );
    expect(d.clasesRest).toBe("ilimitado");
    expect(d.estado).toBe("sin_clases"); // expired
  });

  it("handles a client with no package", () => {
    const d = derivarCliente(
      facts({ paquete_nombre: null, clases_restantes: null, vence: null }),
      HOY,
      0,
    );
    expect(d.estado).toBe("sin_clases");
    expect(d.clasesRest).toBe(0);
    expect(d.diasRest).toBe(0);
    expect(d.venceDisplay).toBe("—");
    expect(d.paquete).toBe("Sin paquete");
  });
});

describe("derivarPaseCliente", () => {
  it("flags porVencer on the CLASES dimension even with days to spare (the lossy-pase bug)", () => {
    // 1 class left, 24 days left: por_vencer fires on clases <= 2. The old inline
    // `diasRest > 0 && diasRest <= 5` dropped this case and showed no warning.
    const p = derivarPaseCliente(facts({ clases_restantes: 1, vence: "2026-06-20" }), HOY);
    expect(p.diasRest).toBe(24);
    expect(p.porVencer).toBe(true);
    expect(p.clasesLabel).toBe("1 clase");
  });

  it("flags porVencer on the DÍAS dimension", () => {
    const p = derivarPaseCliente(facts({ clases_restantes: 8, vence: "2026-05-30" }), HOY);
    expect(p.diasRest).toBe(3);
    expect(p.porVencer).toBe(true);
  });

  it("is not porVencer when both dimensions are healthy", () => {
    const p = derivarPaseCliente(facts({ clases_restantes: 8, vence: "2026-06-20" }), HOY);
    expect(p.porVencer).toBe(false);
    expect(p.clasesLabel).toBe("8 clases");
  });

  it("is not porVencer once expired (sin_clases, not por_vencer)", () => {
    const p = derivarPaseCliente(facts({ clases_restantes: 5, vence: "2026-05-25" }), HOY);
    expect(p.porVencer).toBe(false);
  });

  it("labels ilimitado and never flags it on clases", () => {
    const p = derivarPaseCliente(
      facts({ clases_restantes: null, paquete_nombre: "Ilimitado", vence: "2026-06-20" }),
      HOY,
    );
    expect(p.clasesLabel).toBe("Ilimitado");
    expect(p.porVencer).toBe(false);
  });

  it("handles a client with no package", () => {
    const p = derivarPaseCliente(
      facts({ paquete_nombre: null, clases_restantes: null, vence: null }),
      HOY,
    );
    expect(p.clasesLabel).toBe("Sin paquete");
    expect(p.porVencer).toBe(false);
  });
});

describe("shapeFicha", () => {
  const HOY_ISO = "2026-05-27";
  // Mid-day UTC so the Chihuahua-local calendar day is unambiguous for either -6/-7.
  const clienteRow: FichaClienteRow = {
    id: "c1",
    nombre: "Andrea Castro",
    tel: "614 218 3401",
    paquete_nombre: "8 clases",
    clases_restantes: 5,
    vence: "2026-06-16",
    created_at: "2026-04-10T18:00:00Z",
  };
  const venta = (over: Partial<FichaVentaRow> = {}): FichaVentaRow => ({
    fecha: "2026-05-20T18:00:00Z",
    paquete_nombre: "8 clases",
    monto: 800,
    metodo: "efectivo",
    clases: 8,
    vigencia_tipo: "dias",
    vigencia_dias: 30,
    ...over,
  });

  it("excludes today from historial and reports presentHoy/horaHoy", () => {
    const asist: FichaAsistRow[] = [
      { fecha: "2026-05-27", hora: "07:30:00", consumio: true }, // today
      { fecha: "2026-05-25", hora: "08:15:00", consumio: true },
      { fecha: "2026-05-20", hora: null, consumio: true }, // back-entry, no time
    ];
    const f = shapeFicha(clienteRow, asist, [], HOY, HOY_ISO, [], "FORGE", 0);
    expect(f.presentHoy).toBe(true);
    expect(f.horaHoy).toBe("07:30");
    expect(f.historial).toHaveLength(2); // today excluded
    expect(f.historial.every((h) => !h.today)).toBe(true);
    expect(f.historial[0].dDisplay).toContain("25");
    expect(f.historial[0].hora).toBe("08:15");
    expect(f.historial[1].hora).toBeNull();
  });

  it("maps pagos with pesos + metodo label (pendiente -> Por pagar) and reads the active package", () => {
    const ventas = [
      venta(),
      venta({ paquete_nombre: "Ilimitado", monto: 1200, metodo: "pendiente", clases: null, vigencia_tipo: "mes", vigencia_dias: null }),
    ];
    const f = shapeFicha(clienteRow, [], ventas, HOY, HOY_ISO, [], "FORGE", 0);
    expect(f.pagos[0]).toEqual({ fechaDisplay: "20 may", paquete: "8 clases", montoDisplay: "$800", metodo: "Efectivo" });
    expect(f.pagos[1].metodo).toBe("Por pagar");
    expect(f.ventasCount).toBe(2);
    expect(f.totalClases).toBe(8); // latest = ventas[0]
    expect(f.dayDenom).toBe(30);
    expect(f.compradoDisplay).toBe("20 may");
  });

  it("dayDenom falls back to 30 for mes packages, no ventas, AND a 0 vigencia_dias (divide-by-zero guard)", () => {
    expect(shapeFicha(clienteRow, [], [], HOY, HOY_ISO, [], "FORGE", 0).dayDenom).toBe(30);
    expect(
      shapeFicha(clienteRow, [], [venta({ vigencia_tipo: "mes", vigencia_dias: null })], HOY, HOY_ISO, [], "FORGE", 0).dayDenom,
    ).toBe(30);
    expect(
      shapeFicha(clienteRow, [], [venta({ vigencia_dias: 0 })], HOY, HOY_ISO, [], "FORGE", 0).dayDenom,
    ).toBe(30); // the `|| 30` guard, not `?? 30`
  });

  it("renders the recordatorio waText from the derived saldo + negocio", () => {
    const body = "Hola {nombre}, te quedan {clases} de tu {paquete} (vence {vence}). — {negocio}";
    const f = shapeFicha(clienteRow, [], [], HOY, HOY_ISO, [{ id: "t1", nombre: "Recordatorio", body }], "FORGE GYM", 0);
    expect(f.mensajes).toEqual([
      { id: "t1", nombre: "Recordatorio", texto: "Hola Andrea, te quedan 5 clases de tu 8 clases (vence 16 jun). — FORGE GYM" },
    ]);
    expect(f.cliente.estado).toBe("activo");
  });
});

describe("gauge helpers (pure)", () => {
  it("gaugeFill is remaining/denom, clamped to [0, 1]", () => {
    expect(gaugeFill(5, 8)).toBeCloseTo(0.625);
    expect(gaugeFill(23, 24)).toBeCloseTo(23 / 24); // stacked balance, ratio < 1
    expect(gaugeFill(8, 8)).toBe(1); // just bought, full
  });

  it("gaugeFill clamps a denom <= 0 to an empty bar (no NaN / Infinity / >1)", () => {
    expect(gaugeFill(5, 0)).toBe(0); // divide-by-zero guard
    expect(gaugeFill(5, -3)).toBe(0); // negative denom
    expect(gaugeFill(0, 0)).toBe(0);
  });

  it("gaugeFill never exceeds 1 even when remaining > denom", () => {
    expect(gaugeFill(23, 8)).toBe(1); // the old "23 / 8" overflow, now clamped
  });

  it("gaugeFill floors a negative remaining (overdrawn días) at 0", () => {
    expect(gaugeFill(-2, 20)).toBe(0);
  });

  it("clasesDenom = clasesRest + attendedSincePurchase (the granted balance)", () => {
    expect(clasesDenom(23, 1)).toBe(24);
    expect(clasesDenom(8, 0)).toBe(8); // just purchased, none used
    expect(clasesDenom(0, 8)).toBe(8); // fully drained
  });

  it("diasDenom = days from the last purchase to vence", () => {
    expect(diasDenom(new Date(2026, 5, 16), new Date(2026, 4, 17))).toBe(30);
    expect(diasDenom(new Date(2026, 5, 16), new Date(2026, 5, 16))).toBe(0); // same day
  });
});

describe("shapeFicha gauges", () => {
  const HOY_ISO = "2026-05-27";
  const clienteRow: FichaClienteRow = {
    id: "c1",
    nombre: "Andrea Castro",
    tel: "614 218 3401",
    paquete_nombre: "8 clases",
    clases_restantes: 5,
    vence: "2026-06-16",
    created_at: "2026-04-10T18:00:00Z",
  };
  const venta = (over: Partial<FichaVentaRow> = {}): FichaVentaRow => ({
    fecha: "2026-05-17T18:00:00Z", // purchased 10 days ago; vence 2026-06-16 → 30-day window
    paquete_nombre: "8 clases",
    monto: 800,
    metodo: "efectivo",
    clases: 8,
    vigencia_tipo: "dias",
    vigencia_dias: 30,
    ...over,
  });

  it("stacks the clases balance: clasesRest 23 + usadas 1 → fill 23/24, usadas 1", () => {
    const row = { ...clienteRow, clases_restantes: 23 };
    const f = shapeFicha(row, [], [venta({ clases: 8 })], HOY, HOY_ISO, [], "FORGE", 1);
    expect(f.clasesGauge).not.toBeNull();
    expect(f.clasesGauge!.usadas).toBe(1);
    expect(f.clasesGauge!.fill).toBeCloseTo(23 / 24);
  });

  it("just-purchased reads ≈ full (nothing used yet)", () => {
    const row = { ...clienteRow, clases_restantes: 8 };
    const f = shapeFicha(row, [], [venta({ clases: 8 })], HOY, HOY_ISO, [], "FORGE", 0);
    expect(f.clasesGauge!.fill).toBe(1);
    expect(f.clasesGauge!.usadas).toBe(0);
  });

  it("partially drained: clasesRest 3 + usadas 5 → fill 3/8", () => {
    const row = { ...clienteRow, clases_restantes: 3 };
    const f = shapeFicha(row, [], [venta({ clases: 8 })], HOY, HOY_ISO, [], "FORGE", 5);
    expect(f.clasesGauge!.fill).toBeCloseTo(3 / 8);
    expect(f.clasesGauge!.usadas).toBe(5);
  });

  it("expired/forfeited (clasesRest 0) → empty clases bar, usadas reflects real count", () => {
    const row = { ...clienteRow, clases_restantes: 0 };
    const f = shapeFicha(row, [], [venta({ clases: 8 })], HOY, HOY_ISO, [], "FORGE", 8);
    expect(f.clasesGauge!.fill).toBe(0);
    expect(f.clasesGauge!.usadas).toBe(8);
  });

  it("ilimitado clases → clasesGauge null (no decrement, bar meaningless); días still shows", () => {
    const row = {
      ...clienteRow,
      paquete_nombre: "Ilimitado",
      clases_restantes: null,
    };
    const f = shapeFicha(
      row,
      [],
      [venta({ clases: null, vigencia_tipo: "mes", vigencia_dias: null })],
      HOY,
      HOY_ISO,
      [],
      "FORGE",
      0,
    );
    expect(f.clasesGauge).toBeNull();
    expect(f.diasGauge).not.toBeNull();
  });

  it("no ventas → both gauges null (no anchor)", () => {
    const f = shapeFicha(clienteRow, [], [], HOY, HOY_ISO, [], "FORGE", 0);
    expect(f.clasesGauge).toBeNull();
    expect(f.diasGauge).toBeNull();
  });

  it("días fill from vence vs the last purchase date", () => {
    // purchased 2026-05-17, vence 2026-06-16 → denom 30; today 2026-05-27 → diasRest 20 → 20/30.
    const f = shapeFicha(clienteRow, [], [venta()], HOY, HOY_ISO, [], "FORGE", 0);
    expect(f.diasGauge!.fill).toBeCloseTo(20 / 30);
  });

  it("días denom <= 0 (purchased on/after vence) clamps fill to its bounds", () => {
    // Degenerate venta dated the same day as vence → denom 0 → empty bar, no divide-by-zero.
    const f = shapeFicha(
      clienteRow,
      [],
      [venta({ fecha: "2026-06-16T18:00:00Z" })],
      HOY,
      HOY_ISO,
      [],
      "FORGE",
      0,
    );
    expect(f.diasGauge!.fill).toBe(0);
  });
});
