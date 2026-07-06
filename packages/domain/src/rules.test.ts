import { describe, it, expect } from "vitest";
import { baseParaStack, calcularResumenMes, calcVigenciaEnd, consumirClase, cupoValido, derivarEstado, derivarEstadoSesion, derivarEstadosDia, diasRestantes, disponibles, duracionValida, forfeit, horaValida, indicePrimeraNoPasada, materializarSesion, muestraEspecial, nombrePaquete, ratioOcupacion, renderPlantilla, resumirRoster, stackPaquete, urgenciaCliente } from "./rules";
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

describe("nombrePaquete", () => {
  it("derives 'Ilimitado' for a null grant", () => {
    expect(nombrePaquete(null)).toBe("Ilimitado");
  });
  it("derives the singular '1 clase' for a grant of 1", () => {
    expect(nombrePaquete(1)).toBe("1 clase");
  });
  it("derives the plural '{n} clases' for a grant > 1", () => {
    expect(nombrePaquete(2)).toBe("2 clases");
    expect(nombrePaquete(30)).toBe("30 clases");
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

describe("resumirRoster", () => {
  it("is all-zero for an empty roster", () => {
    expect(resumirRoster([])).toEqual({ vigentes: 0, totalActivos: 0 });
  });
  it("counts vigentes (activo) and totalActivos (not sin_clases)", () => {
    expect(resumirRoster(["activo", "activo", "por_vencer", "sin_clases"])).toEqual({
      vigentes: 2,
      totalActivos: 3,
    });
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

describe("baseParaStack", () => {
  it("keeps a still-valid package's saldo", () => {
    expect(baseParaStack({ clases: 5, dias: 3 })).toEqual({ clases: 5, dias: 3 });
  });
  it("forfeits an expired package entirely (dias < 0)", () => {
    expect(baseParaStack({ clases: 5, dias: -1 })).toEqual({ clases: 0, dias: 0 });
  });
  it("forfeits on the expiry day itself (dias === 0)", () => {
    expect(baseParaStack({ clases: 5, dias: 0 })).toEqual({ clases: 0, dias: 0 });
  });
  it("drops a lapsed ilimitado — a renewal does NOT carry unlimited forward", () => {
    expect(baseParaStack({ clases: "ilimitado", dias: -1 })).toEqual({ clases: 0, dias: 0 });
  });
  it("keeps a still-valid ilimitado", () => {
    expect(baseParaStack({ clases: "ilimitado", dias: 5 })).toEqual({ clases: "ilimitado", dias: 5 });
  });
  it("stacking onto an expired package does not carry its classes (the renewal bug guard)", () => {
    expect(stackPaquete(baseParaStack({ clases: 5, dias: -1 }), { clases: 8, dias: 20 })).toEqual({
      clases: 8,
      dias: 20,
    });
  });
});

describe("urgenciaCliente", () => {
  it("is ok with classes and time to spare", () => {
    expect(urgenciaCliente({ clases: 8, dias: 20 }).nivel).toBe("ok");
    expect(urgenciaCliente({ clases: "ilimitado", dias: 20 }).nivel).toBe("ok");
  });
  it("is critico at <= 3 days OR <= 1 class", () => {
    expect(urgenciaCliente({ clases: 8, dias: 3 }).nivel).toBe("critico");
    expect(urgenciaCliente({ clases: 1, dias: 20 }).nivel).toBe("critico");
    expect(urgenciaCliente({ clases: "ilimitado", dias: 3 }).nivel).toBe("critico"); // días bind ilimitado
  });
  it("is urgente at <= 7 days OR <= 3 classes (above critico)", () => {
    expect(urgenciaCliente({ clases: 8, dias: 7 }).nivel).toBe("urgente");
    expect(urgenciaCliente({ clases: 2, dias: 20 }).nivel).toBe("urgente");
  });
  it("is pronto at <= 14 days OR <= 5 classes (above urgente)", () => {
    expect(urgenciaCliente({ clases: 8, dias: 14 }).nivel).toBe("pronto");
    expect(urgenciaCliente({ clases: 5, dias: 20 }).nivel).toBe("pronto");
  });
  it("binds on whichever dimension lapses first", () => {
    expect(urgenciaCliente({ clases: 1, dias: 20 }).vinculante).toBe("clases");
    expect(urgenciaCliente({ clases: 8, dias: 2 }).vinculante).toBe("dias");
    expect(urgenciaCliente({ clases: "ilimitado", dias: 2 }).vinculante).toBe("dias");
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
  //   Apr:  3 abr $500, 28 abr $700  => prev-to-date (day ≤ 27): 1 venta / $500 (28 abr excluded)
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
  //   Apr: 3 rows; only 5 & 6 abr (day ≤ 27) count toward prev — 30 abr excluded
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

  it("totals the prior month through the same day-of-month (prior-month-to-date)", () => {
    // HOY = 27 May, diaHoy = 27 → April slice is 1..27 abr.
    expect(r.ingresosMesPrev).toBe(500); // only 3 abr $500; 28 abr (day 28 > 27) excluded
    expect(r.ventasMesPrev).toBe(1);     // was 2
    expect(r.asistMesPrev).toBe(2);      // 5 & 6 abr in; 30 abr (day 30 > 27) excluded — was 3
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
    expect(empty.ventasMesPrev).toBe(0);
    expect(empty.asistMesPrev).toBe(0);
    expect(empty.asistenciasHoy).toBe(0);
    expect(empty.asistenciasAyer).toBe(0);
    expect(empty.ingresosSemana).toBe(0);
    expect(empty.asistenciasSemana).toEqual([0, 0, 0, 0, 0, 0, 0]);
  });

  it("rolls the prior month across a year boundary with the day-of-month cutoff (Jan hoy → Dec prev)", () => {
    const enero = new Date(2026, 0, 15); // diaHoy = 15
    const rr = calcularResumenMes(
      [v(2025, 11, 10, 100), v(2025, 11, 20, 900), v(2026, 0, 10, 100)],
      [a(2025, 11, 10), a(2025, 11, 31), a(2026, 0, 5)],
      enero,
    );
    expect(rr.ingresosMes).toBe(100);     // 10 ene
    expect(rr.ingresosMesPrev).toBe(100); // only 10 dic (day 10 ≤ 15); 20 dic excluded
    expect(rr.asistMes).toBe(1);          // 5 ene
    expect(rr.asistMesPrev).toBe(1);      // only 10 dic; 31 dic excluded
  });

  it("on the 1st, compares against the prior month's day-1 slice (no full-month collapse)", () => {
    const primero = new Date(2026, 5, 1); // 1 Jun 2026, diaHoy = 1
    const rr = calcularResumenMes(
      [v(2026, 5, 1, 400), v(2026, 4, 1, 300), v(2026, 4, 20, 900)],
      [],
      primero,
    );
    expect(rr.ingresosMes).toBe(400);
    expect(rr.ingresosMesPrev).toBe(300); // only 1 may; 20 may (day 20 > 1) excluded
  });

  it("includes the whole short prior month at month-end (Mar 31 vs 28-day Feb)", () => {
    const finMarzo = new Date(2026, 2, 31); // 31 Mar 2026, diaHoy = 31
    const rr = calcularResumenMes([v(2026, 1, 28, 700)], [], finMarzo); // 28 feb
    expect(rr.ingresosMesPrev).toBe(700); // 28 ≤ 31 → counted, no clamp
  });
});

// ── Agenda scheduling rules (Phase 5, ADR-0010) ──────────────────────────

describe("disponibles", () => {
  it("is capacity minus active count", () => {
    expect(disponibles(20, 12)).toBe(8);
  });
  it("clamps at 0 (never goes negative)", () => {
    expect(disponibles(20, 25)).toBe(0);
  });
});

describe("ratioOcupacion", () => {
  it("is the active fraction of capacity", () => {
    expect(ratioOcupacion(20, 18)).toBe(0.9);
    expect(ratioOcupacion(24, 16)).toBeCloseTo(0.667, 3);
  });
});

describe("derivarEstadoSesion + derivarEstadosDia (fixture: MIÉ 17 JUN mock digest)", () => {
  // The approved Agenda mock's day list, 17 jun 2026 (real calendar Wed):
  // 06:15 FUERZA 24/24 (past → TERMINÓ) · 08:15 FUNCIONAL 19/24 (next up →
  // A CONTINUACIÓN) · 12:30 METCON 18/20 (90% → CASI LLENO) · 18:15 FUERZA
  // 16/24 ★ NOCHE DE FUERZA (67% → normal) · 19:15 FUNCIONAL 17/20 (exactly
  // the 85% threshold → CASI LLENO).
  const DIA = (h: number, m: number) => new Date(2026, 5, 17, h, m);
  const AHORA = DIA(7, 0); // between the 06:15 and 08:15 rows

  const sesiones = [
    { startsAt: DIA(6, 15), capacidad: 24, activos: 24 },
    { startsAt: DIA(8, 15), capacidad: 24, activos: 19 },
    { startsAt: DIA(12, 30), capacidad: 20, activos: 18 },
    { startsAt: DIA(18, 15), capacidad: 24, activos: 16 },
    { startsAt: DIA(19, 15), capacidad: 20, activos: 17 },
  ];

  it("derives the whole day's estados in one batch pass, matching the mock digest", () => {
    expect(derivarEstadosDia(sesiones, AHORA)).toEqual([
      "termino",
      "a_continuacion",
      "casi_lleno",
      "normal",
      "casi_lleno",
    ]);
  });

  it("terminó suppresses count states — a past FULL session is termino, not lleno", () => {
    expect(derivarEstadoSesion(sesiones[0], AHORA, false)).toBe("termino");
    // adversarial: even flagged as the day's "next" session, a past start always wins
    expect(derivarEstadoSesion(sesiones[0], AHORA, true)).toBe("termino");
  });

  it("a_continuacion is the day's first NON-past session only", () => {
    expect(indicePrimeraNoPasada(sesiones, AHORA)).toBe(1);
  });

  it("lleno fires at count >= capacity; casi_lleno at ratio >= 0.85 inclusive", () => {
    expect(derivarEstadoSesion({ startsAt: DIA(20, 0), capacidad: 20, activos: 20 }, AHORA, false)).toBe("lleno");
    expect(derivarEstadoSesion({ startsAt: DIA(20, 0), capacidad: 20, activos: 17 }, AHORA, false)).toBe(
      "casi_lleno",
    ); // exactly 0.85
    expect(derivarEstadoSesion({ startsAt: DIA(20, 0), capacidad: 20, activos: 16 }, AHORA, false)).toBe("normal"); // 0.80, just under
  });

  it("is all-termino once the whole day is past", () => {
    const finDia = DIA(23, 0);
    expect(derivarEstadosDia(sesiones, finDia)).toEqual([
      "termino",
      "termino",
      "termino",
      "termino",
      "termino",
    ]);
    expect(indicePrimeraNoPasada(sesiones, finDia)).toBe(-1);
  });
});

describe("muestraEspecial", () => {
  it("shows the especial badge when the session isn't a-continuación", () => {
    expect(muestraEspecial("normal", true)).toBe(true);
    expect(muestraEspecial("casi_lleno", true)).toBe(true);
  });
  it("a-continuación supersedes the especial badge (mock: only one top-badge slot)", () => {
    expect(muestraEspecial("a_continuacion", true)).toBe(false);
  });
  it("is false for a non-especial session regardless of estado", () => {
    expect(muestraEspecial("normal", false)).toBe(false);
    expect(muestraEspecial("a_continuacion", false)).toBe(false);
  });
});

describe("duracionValida", () => {
  it("accepts the five allowed durations", () => {
    for (const min of [30, 45, 60, 75, 90]) expect(duracionValida(min)).toBe(true);
  });
  it("rejects anything else", () => {
    expect(duracionValida(50)).toBe(false);
    expect(duracionValida(0)).toBe(false);
  });
});

describe("cupoValido", () => {
  it("accepts the 4-40 whole-number range", () => {
    expect(cupoValido(4)).toBe(true);
    expect(cupoValido(40)).toBe(true);
    expect(cupoValido(24)).toBe(true);
  });
  it("rejects out of range or fractional", () => {
    expect(cupoValido(3)).toBe(false);
    expect(cupoValido(41)).toBe(false);
    expect(cupoValido(20.5)).toBe(false);
  });
});

describe("horaValida", () => {
  it("accepts the 05:00-22:45 range on 15-min steps", () => {
    expect(horaValida("05:00")).toBe(true);
    expect(horaValida("22:45")).toBe(true);
    expect(horaValida("18:00")).toBe(true);
    expect(horaValida("12:15")).toBe(true);
  });
  it("rejects outside the range", () => {
    expect(horaValida("04:45")).toBe(false);
    expect(horaValida("23:00")).toBe(false);
  });
  it("rejects non-15-min steps", () => {
    expect(horaValida("18:05")).toBe(false);
    expect(horaValida("18:10")).toBe(false);
  });
  it("rejects malformed strings", () => {
    expect(horaValida("6:00")).toBe(false);
    expect(horaValida("18:00:00")).toBe(false);
  });
});

describe("materializarSesion", () => {
  const LUNES = new Date(2026, 5, 15); // Mon 15 jun 2026 — same week as the mock digest
  const CHIHUAHUA = "America/Chihuahua";
  const MEXICO_CITY = "America/Mexico_City";

  it("is deterministic — repeated calls with the same inputs yield the same instant (the idempotency the (template_id, starts_at) unique guard relies on)", () => {
    const plantilla = { weekday: 2, startTime: "18:00" }; // Wed (Lunes+2)
    const a = materializarSesion(plantilla, LUNES, CHIHUAHUA);
    const b = materializarSesion(plantilla, LUNES, CHIHUAHUA);
    expect(a.getTime()).toBe(b.getTime());
  });

  it("places the weekday offset from the week's Monday (weekday 0=Lunes..5=Sábado)", () => {
    const lunes = materializarSesion({ weekday: 0, startTime: "06:00" }, LUNES, MEXICO_CITY);
    const sabado = materializarSesion({ weekday: 5, startTime: "06:00" }, LUNES, MEXICO_CITY);
    expect(Math.round((sabado.getTime() - lunes.getTime()) / 86_400_000)).toBe(5);
  });

  it("round-trips: the instant, read back through the SAME tz, reproduces the wall clock it was built from", () => {
    const instante = materializarSesion({ weekday: 2, startTime: "18:00" }, LUNES, CHIHUAHUA);
    const dtf = new Intl.DateTimeFormat("en-CA", {
      timeZone: CHIHUAHUA,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = dtf.formatToParts(instante);
    const get = (t: string) => parts.find((p) => p.type === t)!.value;
    expect(`${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`).toBe(
      "2026-06-17 18:00",
    );
  });

  it("is tz-honest: the same wall clock in two different gym zones yields two different absolute instants (historical divergence, pre-2022-reform June DST: Chihuahua GMT-6 / Mexico City GMT-5)", () => {
    const lunes2020 = new Date(2020, 5, 15); // Mon 15 jun 2020
    const plantilla = { weekday: 0, startTime: "18:00" };
    const chi = materializarSesion(plantilla, lunes2020, CHIHUAHUA);
    const mex = materializarSesion(plantilla, lunes2020, MEXICO_CITY);
    expect(chi.getTime()).not.toBe(mex.getTime());
    expect((chi.getTime() - mex.getTime()) / 3_600_000).toBe(1); // Chihuahua 1h behind Mexico City that June
  });
});
