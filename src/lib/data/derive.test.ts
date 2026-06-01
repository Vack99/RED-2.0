import { describe, expect, it } from "vitest";

import {
  derivarCliente,
  derivarPaseCliente,
  shapeFicha,
  type ClienteFacts,
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
    const asist = [
      { fecha: "2026-05-27", hora: "07:30:00" }, // today
      { fecha: "2026-05-25", hora: "08:15:00" },
      { fecha: "2026-05-20", hora: null }, // back-entry, no time
    ];
    const f = shapeFicha(clienteRow, asist, [], HOY, HOY_ISO, "", "FORGE");
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
    const f = shapeFicha(clienteRow, [], ventas, HOY, HOY_ISO, "", "FORGE");
    expect(f.pagos[0]).toEqual({ fechaDisplay: "20 may", paquete: "8 clases", montoDisplay: "$800", metodo: "Efectivo" });
    expect(f.pagos[1].metodo).toBe("Por pagar");
    expect(f.ventasCount).toBe(2);
    expect(f.totalClases).toBe(8); // latest = ventas[0]
    expect(f.dayDenom).toBe(30);
    expect(f.compradoDisplay).toBe("20 may");
  });

  it("dayDenom falls back to 30 for mes packages, no ventas, AND a 0 vigencia_dias (divide-by-zero guard)", () => {
    expect(shapeFicha(clienteRow, [], [], HOY, HOY_ISO, "", "FORGE").dayDenom).toBe(30);
    expect(
      shapeFicha(clienteRow, [], [venta({ vigencia_tipo: "mes", vigencia_dias: null })], HOY, HOY_ISO, "", "FORGE").dayDenom,
    ).toBe(30);
    expect(
      shapeFicha(clienteRow, [], [venta({ vigencia_dias: 0 })], HOY, HOY_ISO, "", "FORGE").dayDenom,
    ).toBe(30); // the `|| 30` guard, not `?? 30`
  });

  it("renders the recordatorio waText from the derived saldo + negocio", () => {
    const body = "Hola {nombre}, te quedan {clases} de tu {paquete} (vence {vence}). — {negocio}";
    const f = shapeFicha(clienteRow, [], [], HOY, HOY_ISO, body, "FORGE GYM");
    expect(f.waText).toBe("Hola Andrea, te quedan 5 clases de tu 8 clases (vence 16 jun). — FORGE GYM");
    expect(f.cliente.estado).toBe("activo");
  });
});
