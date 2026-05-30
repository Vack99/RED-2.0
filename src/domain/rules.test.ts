import { describe, it, expect } from "vitest";
import { calcularResumenMes, calcVigenciaEnd, consumirClase, derivarEstado, diasRestantes, forfeit, renderPlantilla, stackPaquete } from "./rules";
import type { AsistenciaResumen, VentaResumen } from "./types";

describe("stackPaquete", () => {
  it("adds classes and days onto the current package (brief Q5)", () => {
    expect(stackPaquete({ clases: 5, dias: 3 }, { clases: 8, dias: 20 })).toEqual({
      clases: 13,
      dias: 23,
    });
  });

  it("keeps classes ilimitado when the current package is ilimitado", () => {
    expect(
      stackPaquete({ clases: "ilimitado", dias: 10 }, { clases: 8, dias: 20 }),
    ).toEqual({ clases: "ilimitado", dias: 30 });
  });

  it("keeps classes ilimitado when the new package is ilimitado", () => {
    expect(
      stackPaquete({ clases: 5, dias: 3 }, { clases: "ilimitado", dias: 30 }),
    ).toEqual({ clases: "ilimitado", dias: 33 });
  });

  it("keeps classes ilimitado when both packages are ilimitado", () => {
    expect(
      stackPaquete({ clases: "ilimitado", dias: 10 }, { clases: "ilimitado", dias: 20 }),
    ).toEqual({ clases: "ilimitado", dias: 30 });
  });
});

describe("calcVigenciaEnd", () => {
  it("adds fixed days for an 8-class package (20 días)", () => {
    const end = calcVigenciaEnd(new Date(2026, 4, 13), 20); // 13 may
    expect([end.getFullYear(), end.getMonth(), end.getDate()]).toEqual([2026, 5, 2]); // 2 jun
  });

  it("adds fixed days for a 12-class package (25 días)", () => {
    const end = calcVigenciaEnd(new Date(2026, 4, 13), 25);
    expect([end.getFullYear(), end.getMonth(), end.getDate()]).toEqual([2026, 5, 7]); // 7 jun
  });

  it("runs Ilimitado to the last day of the purchase month (brief Q1)", () => {
    const end = calcVigenciaEnd(new Date(2026, 4, 13), "mes");
    expect([end.getFullYear(), end.getMonth(), end.getDate()]).toEqual([2026, 4, 31]); // 31 may
  });

  it("runs Ilimitado to Dec 31 (year stays the same)", () => {
    const end = calcVigenciaEnd(new Date(2026, 11, 5), "mes"); // 5 dic
    expect([end.getFullYear(), end.getMonth(), end.getDate()]).toEqual([2026, 11, 31]);
  });

  it("handles month-end for a short non-leap February", () => {
    const end = calcVigenciaEnd(new Date(2026, 1, 15), "mes");
    expect([end.getFullYear(), end.getMonth(), end.getDate()]).toEqual([2026, 1, 28]);
  });
});

describe("diasRestantes", () => {
  it("counts whole days until vence", () => {
    expect(diasRestantes(new Date(2026, 4, 30), new Date(2026, 4, 27))).toBe(3);
  });
  it("is 0 on the vence day", () => {
    expect(diasRestantes(new Date(2026, 4, 27), new Date(2026, 4, 27))).toBe(0);
  });
  it("is negative once expired", () => {
    expect(diasRestantes(new Date(2026, 4, 25), new Date(2026, 4, 27))).toBe(-2);
  });
});

describe("derivarEstado", () => {
  it("is activo with classes and time to spare", () => {
    expect(derivarEstado({ clases: 8, dias: 20 })).toBe("activo");
    expect(derivarEstado({ clases: "ilimitado", dias: 20 })).toBe("activo");
    expect(derivarEstado({ clases: 3, dias: 20 })).toBe("activo"); // just above the 2-class threshold
    expect(derivarEstado({ clases: 8, dias: 6 })).toBe("activo"); // just above the 5-day threshold
  });
  it("is por_vencer at <= 5 days left", () => {
    expect(derivarEstado({ clases: 8, dias: 5 })).toBe("por_vencer");
    expect(derivarEstado({ clases: "ilimitado", dias: 3 })).toBe("por_vencer");
  });
  it("is por_vencer at <= 2 classes left", () => {
    expect(derivarEstado({ clases: 2, dias: 20 })).toBe("por_vencer");
  });
  it("is sin_clases when out of classes", () => {
    expect(derivarEstado({ clases: 0, dias: 20 })).toBe("sin_clases");
  });
  it("is sin_clases when expired", () => {
    expect(derivarEstado({ clases: 5, dias: 0 })).toBe("sin_clases");
    expect(derivarEstado({ clases: 5, dias: -2 })).toBe("sin_clases");
  });
});

describe("consumirClase", () => {
  it("subtracts one class", () => {
    expect(consumirClase(5)).toBe(4);
  });
  it("never goes below zero", () => {
    expect(consumirClase(1)).toBe(0);
    expect(consumirClase(0)).toBe(0);
  });
  it("never decrements ilimitado", () => {
    expect(consumirClase("ilimitado")).toBe("ilimitado");
  });
});

describe("forfeit", () => {
  it("forfeits remaining classes once expired (brief Q2)", () => {
    expect(forfeit(5, -1)).toBe(0);
  });
  it("forfeits classes on the expiry day itself (dias === 0)", () => {
    expect(forfeit(5, 0)).toBe(0);
  });
  it("keeps classes while still valid", () => {
    expect(forfeit(5, 3)).toBe(5);
  });
  it("leaves ilimitado untouched", () => {
    expect(forfeit("ilimitado", -1)).toBe("ilimitado");
  });
});

describe("renderPlantilla", () => {
  it("substitutes known tokens", () => {
    expect(
      renderPlantilla("Hola {nombre}, te quedan {clases}.", {
        nombre: "Andrea",
        clases: "5 clases",
      }),
    ).toBe("Hola Andrea, te quedan 5 clases.");
  });
  it("leaves unknown tokens intact so typos are visible", () => {
    expect(renderPlantilla("Saldo {desconocido}", {})).toBe("Saldo {desconocido}");
  });
  it("substitutes the datos_pago block", () => {
    expect(renderPlantilla("{datos_pago}", { datos_pago: "CLABE 123" })).toBe("CLABE 123");
  });
  it("substitutes the negocio (brand) token", () => {
    expect(
      renderPlantilla("Gracias por tu compra en {negocio}.", { negocio: "FORGE" }),
    ).toBe("Gracias por tu compra en FORGE.");
  });
  it("renders a realistic multi-token template body", () => {
    const body =
      "Hola {nombre} 👋\n\nTe quedan {clases} de tu paquete (*{paquete}*), vence {vence}. Datos: {datos_pago}";
    expect(
      renderPlantilla(body, {
        nombre: "Andrea",
        clases: "5 clases",
        paquete: "Ilimitado",
        vence: "02 jun",
        datos_pago: "CLABE 123",
      }),
    ).toBe(
      "Hola Andrea 👋\n\nTe quedan 5 clases de tu paquete (*Ilimitado*), vence 02 jun. Datos: CLABE 123",
    );
  });
});

describe("calcularResumenMes", () => {
  // Fixed "today" = Wed 27 May 2026 (months are 0-based). Prior month = April 2026.
  const HOY = new Date(2026, 4, 27);
  const v = (y: number, m: number, d: number, monto: number): VentaResumen => ({
    fecha: new Date(y, m, d),
    monto,
  });
  const a = (y: number, m: number, d: number): AsistenciaResumen => ({
    fecha: new Date(y, m, d),
  });

  // Worked fixture: spans April (prior) and May (current) 2026.
  // Ventas:
  //   Apr:  3 abr $500, 28 abr $700           => prev: 2 ventas / $1200
  //   May:  1 may $400, 21 may $1000 (last 7d),
  //         26 may $300 (ayer/last 7d), 27 may $250 (hoy/last 7d)
  //                                            => mes: 4 ventas / $1950
  //   ingresosSemana (21..27 may incl hoy): 1000 + 300 + 250 = 1550
  const ventas: VentaResumen[] = [
    v(2026, 3, 3, 500),
    v(2026, 3, 28, 700),
    v(2026, 4, 1, 400),
    v(2026, 4, 21, 1000),
    v(2026, 4, 26, 300),
    v(2026, 4, 27, 250),
  ];

  // Asistencias:
  //   Apr: 3 rows (prev month)
  //   May within the 7-day window (21..27 may):
  //     21 may x1, 24 may x1, 26 may x2 (ayer), 27 may x3 (hoy)
  //   plus 2 May rows OUTSIDE the window (2 may, 10 may) — count toward asistMes only
  const asistencias: AsistenciaResumen[] = [
    a(2026, 3, 5),
    a(2026, 3, 6),
    a(2026, 3, 30),
    a(2026, 4, 2),
    a(2026, 4, 10),
    a(2026, 4, 21),
    a(2026, 4, 24),
    a(2026, 4, 26),
    a(2026, 4, 26),
    a(2026, 4, 27),
    a(2026, 4, 27),
    a(2026, 4, 27),
  ];

  const r = calcularResumenMes(ventas, asistencias, HOY);

  it("totals ingresos / ventas for the current calendar month", () => {
    expect(r.ingresosMes).toBe(1950);
    expect(r.ventasMes).toBe(4);
  });

  it("totals asistencias for the current calendar month", () => {
    // May rows: 2, 10, 21, 24, 26x2, 27x3 = 9 (2 of them outside the 7-day window)
    expect(r.asistMes).toBe(9);
  });

  it("totals the PRIOR calendar month for period-over-period deltas", () => {
    expect(r.ingresosMesPrev).toBe(1200);
    expect(r.ventasMesPrev).toBe(2);
    expect(r.asistMesPrev).toBe(3);
  });

  it("counts asistencias hoy vs ayer", () => {
    expect(r.asistenciasHoy).toBe(3); // 27 may x3
    expect(r.asistenciasAyer).toBe(2); // 26 may x2
  });

  it("sums ingresos over the last 7 days (inclusive of hoy)", () => {
    expect(r.ingresosSemana).toBe(1550); // 1000 + 300 + 250
  });

  it("builds a 7-element weekly asistencia series oldest→newest ending today", () => {
    // window days: 21,22,23,24,25,26,27 may
    expect(r.asistenciasSemana).toEqual([1, 0, 0, 1, 0, 2, 3]);
    expect(r.asistenciasSemana).toHaveLength(7);
    // last element is hoy
    expect(r.asistenciasSemana[6]).toBe(r.asistenciasHoy);
  });

  it("is all-zero for empty ledgers", () => {
    const empty = calcularResumenMes([], [], HOY);
    expect(empty.ingresosMes).toBe(0);
    expect(empty.ventasMes).toBe(0);
    expect(empty.asistMes).toBe(0);
    expect(empty.ingresosMesPrev).toBe(0);
    expect(empty.asistenciasHoy).toBe(0);
    expect(empty.asistenciasAyer).toBe(0);
    expect(empty.ingresosSemana).toBe(0);
    expect(empty.asistenciasSemana).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it("rolls the prior month across a year boundary (Jan hoy → Dec prev)", () => {
    const enero = new Date(2026, 0, 15);
    const rr = calcularResumenMes(
      [v(2025, 11, 20, 900), v(2026, 0, 10, 100)],
      [a(2025, 11, 31), a(2026, 0, 5)],
      enero,
    );
    expect(rr.ingresosMes).toBe(100);
    expect(rr.ingresosMesPrev).toBe(900);
    expect(rr.asistMes).toBe(1);
    expect(rr.asistMesPrev).toBe(1);
  });
});
