import { describe, expect, it } from "vitest";

import {
  clasesDenom,
  derivarCliente,
  derivarInvitacion,
  derivarMembresia,
  derivarPaseCliente,
  diasDenom,
  esPrimeraCompra,
  esRegistroOnlinePendiente,
  estadoInvitacion,
  etiquetaClase,
  gaugeFill,
  shapeFicha,
  type ClienteFacts,
  type FichaAsistRow,
  type FichaClienteRow,
  type FichaVentaRow,
  type InvitacionFacts,
  type MembresiaFacts,
} from "./derive";

// Fixed "today" so the derivation is deterministic (months are 0-based).
const HOY = new Date(2026, 4, 27); // 27 May 2026

// shapeFicha's tz arg (slice #25, PRD #17 named exception): every ficha fixture
// below models the REAL Forge gym, whose gym row IS America/Chihuahua — a named
// test constant (not a re-introduced module-level default), mirroring the same
// gym-#1-fixture convention supabase/tests/toggle_pase_rules.sql already uses.
const TZ_FORGE = "America/Chihuahua";

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
  it("is vigente with classes and time to spare", () => {
    const d = derivarCliente(facts(), HOY, 3);
    expect(d.estado).toBe("vigente");
    expect(d.diasRest).toBe(20);
    expect(d.clasesRest).toBe(5);
    expect(d.clasesRestLabel).toBe("5");
    expect(d.venceDisplay).toBe("16 jun");
    expect(d.inicial).toBe("AC");
    expect(d.asistEsteMes).toBe(3);
  });

  it("is vigente at few days/classes left — the old por_vencer split is retired (#225)", () => {
    // 3 días left: pre-#225 this was "por_vencer" (<= 5 days). That threshold now lives
    // in urgenciaCliente/the POR RENOVAR tile, never in estado.
    expect(derivarCliente(facts({ vence: "2026-05-30" }), HOY, 0).estado).toBe("vigente");
    // 2 clases left: pre-#225 this was "por_vencer" (<= 2 clases) too.
    expect(derivarCliente(facts({ clases_restantes: 2, vence: "2026-06-20" }), HOY, 0).estado).toBe(
      "vigente",
    );
  });

  it("is sin_clases when out of classes with days remaining", () => {
    const d = derivarCliente(facts({ clases_restantes: 0, vence: "2026-06-20" }), HOY, 0);
    expect(d.estado).toBe("sin_clases");
  });

  it("forfeits remaining classes once expired (read-time) and is vencido, never sin_clases — FECHA WINS (A2)", () => {
    const d = derivarCliente(facts({ clases_restantes: 5, vence: "2026-05-25" }), HOY, 0);
    expect(d.diasRest).toBe(-2);
    expect(d.clasesRest).toBe(0); // forfeited
    expect(d.estado).toBe("vencido");
  });

  it("keeps ilimitado vigente", () => {
    const d = derivarCliente(
      facts({ clases_restantes: null, paquete_nombre: "Ilimitado", vence: "2026-06-30" }),
      HOY,
      9,
    );
    expect(d.clasesRest).toBe("ilimitado");
    expect(d.clasesRestLabel).toBe("∞");
    expect(d.estado).toBe("vigente");
  });

  it("never forfeits ilimitado but still expires by date", () => {
    const d = derivarCliente(
      facts({ clases_restantes: null, paquete_nombre: "Ilimitado", vence: "2026-05-25" }),
      HOY,
      0,
    );
    expect(d.clasesRest).toBe("ilimitado");
    expect(d.estado).toBe("vencido"); // expired
  });

  it("handles a client with no package — sin_paquete, distinct from sin_clases (#225)", () => {
    const d = derivarCliente(
      facts({ paquete_nombre: null, clases_restantes: null, vence: null }),
      HOY,
      0,
    );
    expect(d.estado).toBe("sin_paquete");
    expect(d.clasesRest).toBe(0);
    expect(d.diasRest).toBe(0);
    expect(d.venceDisplay).toBe("—");
    expect(d.paquete).toBe("Sin paquete");
  });

  it("esPaseSuelto exempts a spent one-off pass from sin_clases (matches the catalog, not the balance)", () => {
    const paseSuelto = new Set(["1 clase"]);
    const d = derivarCliente(
      facts({ paquete_nombre: "1 clase", clases_restantes: 0, vence: "2026-06-20" }),
      HOY,
      0,
      paseSuelto,
    );
    expect(d.estado).toBe("vigente");
  });
});

describe("derivarPaseCliente", () => {
  it("flags porVencer on the CLASES dimension (<= RENOVACION_CLASES) even with days to spare", () => {
    // 1 class left, 24 days left: POR RENOVAR's clases arm fires at <= RENOVACION_CLASES (1).
    const p = derivarPaseCliente(facts({ clases_restantes: 1, vence: "2026-06-20" }), HOY);
    expect(p.diasRest).toBe(24);
    expect(p.porVencer).toBe(true);
    expect(p.clasesLabel).toBe("1 clase");
  });

  it("flags porVencer on the DÍAS dimension (<= RENOVACION_DIAS)", () => {
    const p = derivarPaseCliente(facts({ clases_restantes: 8, vence: "2026-05-30" }), HOY);
    expect(p.diasRest).toBe(3);
    expect(p.porVencer).toBe(true);
  });

  it("is not porVencer when both dimensions are healthy", () => {
    const p = derivarPaseCliente(facts({ clases_restantes: 8, vence: "2026-06-20" }), HOY);
    expect(p.porVencer).toBe(false);
    expect(p.clasesLabel).toBe("8 clases");
  });

  it("is not porVencer once expired (estado vencido — never a POR RENOVAR candidate)", () => {
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
  // The class embed the asistencias read carries (#178). 01:45Z = 19:45 Chihuahua (-6).
  const sesion = (
    over: Partial<NonNullable<FichaAsistRow["class_session"]>> = {},
  ): FichaAsistRow["class_session"] => ({
    starts_at: "2026-05-28T01:45:00Z",
    is_special: false,
    special_name: null,
    class_type: { name: "METCON" },
    ...over,
  });
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
      { fecha: "2026-05-27", hora: "07:30:00", consumio: true, class_session_id: null, class_session: null }, // today
      { fecha: "2026-05-25", hora: "08:15:00", consumio: true, class_session_id: null, class_session: null },
      { fecha: "2026-05-20", hora: null, consumio: true, class_session_id: null, class_session: null }, // back-entry, no time
    ];
    const f = shapeFicha(clienteRow, asist, [], HOY, HOY_ISO, TZ_FORGE, [], "FORGE", 0);
    expect(f.presentHoy).toBe(true);
    expect(f.horaHoy).toBe("07:30");
    expect(f.clasesHoy).toEqual([]);
    expect(f.historial).toHaveLength(2); // today excluded
    expect(f.historial.every((h) => !h.today)).toBe(true);
    expect(f.historial[0].dDisplay).toContain("25");
    expect(f.historial[0].hora).toBe("08:15");
    expect(f.historial[1].hora).toBeNull();
  });

  it("a CLASS visit today is NOT presentHoy — it surfaces as an informational stamp (#89)", () => {
    // The ficha's toggle writes/undoes the ACCESO LIBRE row alone. Reading a class visit as
    // "marked" would make the next tap insert a second, consuming libre row (H1).
    const f = shapeFicha(
      clienteRow,
      [{ fecha: HOY_ISO, hora: "18:05:00", consumio: true, class_session_id: "s9", class_session: sesion() }],
      [],
      HOY,
      HOY_ISO,
      TZ_FORGE,
      [],
      "FORGE",
      0,
    );
    expect(f.presentHoy).toBe(false);
    expect(f.horaHoy).toBeNull();
    expect(f.clasesHoy).toEqual([{ hora: "18:05", clase: "METCON 19:45" }]);
    expect(f.historial).toHaveLength(0); // today is never in historial, either context
    // The leaf renders ONE HOY row per entry here and counts
    // `historial + (presentHoy ? 1 : 0) + clasesHoy` — so a class-only day must yield
    // exactly one renderable entry, else the header would claim a visit the list omits
    // (and the "sin asistencias" empty state would fire under a non-zero count).
    expect(f.historial.length + (f.presentHoy ? 1 : 0) + f.clasesHoy.length).toBe(1);
  });

  it("both of today's contexts coexist: the libre row checks the toggle, the class row stamps", () => {
    const f = shapeFicha(
      clienteRow,
      [
        { fecha: HOY_ISO, hora: "07:30:00", consumio: true, class_session_id: null, class_session: null },
        { fecha: HOY_ISO, hora: null, consumio: false, class_session_id: "s9", class_session: sesion() },
      ],
      [],
      HOY,
      HOY_ISO,
      TZ_FORGE,
      [],
      "FORGE",
      0,
    );
    expect(f.presentHoy).toBe(true);
    expect(f.horaHoy).toBe("07:30");
    // Untimed row keeps a null ARRIVAL hora; the label still carries the class hour.
    expect(f.clasesHoy).toEqual([{ hora: null, clase: "METCON 19:45" }]);
    // Two visits today ⇒ two HOY rows in the leaf, and a count of two.
    expect(f.historial.length + (f.presentHoy ? 1 : 0) + f.clasesHoy.length).toBe(2);
  });

  it("labels the WHOLE 30-day window, not just today (#178)", () => {
    // Two class visits on one PAST day: one row each, told apart by the class label —
    // `hora` (the arrival stamp) is seconds apart and cannot do it.
    const f = shapeFicha(
      clienteRow,
      [
        { fecha: "2026-05-25", hora: "23:11:04", consumio: true, class_session_id: "s1", class_session: sesion() },
        {
          fecha: "2026-05-25",
          hora: "23:11:21",
          consumio: true,
          class_session_id: "s2",
          class_session: sesion({ starts_at: "2026-05-25T13:00:00Z", class_type: { name: "YOGA" } }),
        },
        { fecha: "2026-05-24", hora: "08:15:00", consumio: true, class_session_id: null, class_session: null },
      ],
      [],
      HOY,
      HOY_ISO,
      TZ_FORGE,
      [],
      "FORGE",
      0,
    );
    expect(f.historial).toHaveLength(3);
    expect(f.historial[0]).toEqual({ dDisplay: "lun 25", hora: "23:11", today: false, clase: "METCON 19:45" });
    expect(f.historial[1].clase).toBe("YOGA 07:00");
    // ACCESO LIBRE carries no class — the leaf labels it (one home for that copy).
    expect(f.historial[2].clase).toBeNull();
  });

  describe("etiquetaClase", () => {
    it("names the class and its OWN scheduled hour, gym-local", () => {
      expect(etiquetaClase(sesion(), TZ_FORGE)).toBe("METCON 19:45");
      // Bogotá (GMT-5, the format suite's control zone) — the hour is the GYM's, not UTC's.
      expect(etiquetaClase(sesion(), "America/Bogota")).toBe("METCON 20:45");
    });

    it("a clase especial reads its own name", () => {
      expect(etiquetaClase(sesion({ is_special: true, special_name: "Noche de Fuerza" }), TZ_FORGE)).toBe(
        "Noche de Fuerza 19:45",
      );
    });

    it("falls back to the class type when the especial was saved with a blank name", () => {
      expect(etiquetaClase(sesion({ is_special: true, special_name: "  " }), TZ_FORGE)).toBe("METCON 19:45");
    });

    it("falls back to a bare 'Clase' when the session did not resolve — never ACCESO LIBRE", () => {
      expect(etiquetaClase(null, TZ_FORGE)).toBe("Clase");
      expect(etiquetaClase(sesion({ class_type: null }), TZ_FORGE)).toBe("Clase 19:45");
    });
  });

  it("maps pagos with pesos + metodo label and reads the active package", () => {
    const ventas = [
      venta(),
      venta({ paquete_nombre: "Ilimitado", monto: 1200, metodo: "transferencia", clases: null, vigencia_tipo: "mes", vigencia_dias: null }),
    ];
    const f = shapeFicha(clienteRow, [], ventas, HOY, HOY_ISO, TZ_FORGE, [], "FORGE", 0);
    expect(f.pagos[0]).toEqual({ fechaDisplay: "20 may", paquete: "8 clases", montoDisplay: "$800", metodo: "Efectivo" });
    expect(f.pagos[1].metodo).toBe("Transferencia");
    expect(f.ventasCount).toBe(2);
    expect(f.primeraCompra).toBe(false); // has sales
    expect(f.totalClases).toBe(8); // latest = ventas[0]
    expect(f.dayDenom).toBe(30);
    expect(f.compradoDisplay).toBe("20 may");
  });

  it("flags primeraCompra when the member has no ventas (#77)", () => {
    expect(shapeFicha(clienteRow, [], [], HOY, HOY_ISO, TZ_FORGE, [], "FORGE", 0).primeraCompra).toBe(true);
    expect(
      shapeFicha(clienteRow, [], [venta()], HOY, HOY_ISO, TZ_FORGE, [], "FORGE", 0).primeraCompra,
    ).toBe(false);
  });

  it("dayDenom falls back to 30 for mes packages, no ventas, AND a 0 vigencia_dias (divide-by-zero guard)", () => {
    expect(shapeFicha(clienteRow, [], [], HOY, HOY_ISO, TZ_FORGE, [], "FORGE", 0).dayDenom).toBe(30);
    expect(
      shapeFicha(clienteRow, [], [venta({ vigencia_tipo: "mes", vigencia_dias: null })], HOY, HOY_ISO, TZ_FORGE, [], "FORGE", 0).dayDenom,
    ).toBe(30);
    expect(
      shapeFicha(clienteRow, [], [venta({ vigencia_dias: 0 })], HOY, HOY_ISO, TZ_FORGE, [], "FORGE", 0).dayDenom,
    ).toBe(30); // the `|| 30` guard, not `?? 30`
  });

  it("renders mensajes from the templates for the derived saldo + negocio", () => {
    const body = "Hola {nombre}, te quedan {clases} de tu {paquete} (vence {vence}). — {negocio}";
    const f = shapeFicha(clienteRow, [], [], HOY, HOY_ISO, TZ_FORGE, [{ id: "t1", nombre: "Recordatorio", body }], "FORGE GYM", 0);
    expect(f.mensajes).toEqual([
      { id: "t1", nombre: "Recordatorio", texto: "Hola Andrea, te quedan 5 clases de tu 8 clases (vence 16 jun). — FORGE GYM" },
    ]);
    expect(f.cliente.estado).toBe("vigente");
  });

  it("resolves the {dias}/{precios}/{datos_pago} tokens from the derived diasRest + the extras arg", () => {
    // vence 2026-06-16, hoy 2026-05-27 → diasRest 20 → fmtDias "20 días".
    const body = "Vence en {dias}.\nPrecios:\n{precios}\nPago:\n{datos_pago}";
    const f = shapeFicha(
      clienteRow,
      [],
      [],
      HOY,
      HOY_ISO,
      TZ_FORGE,
      [{ id: "t1", nombre: "Renovación", body }],
      "FORGE",
      0,
      { precios: "• 8 clases — $800", datos_pago: "Transferencia: BBVA" },
    );
    expect(f.mensajes[0].texto).toBe(
      "Vence en 20 días.\nPrecios:\n• 8 clases — $800\nPago:\nTransferencia: BBVA",
    );
    // No leftover literal placeholders.
    expect(f.mensajes[0].texto).not.toContain("{dias}");
    expect(f.mensajes[0].texto).not.toContain("{precios}");
    expect(f.mensajes[0].texto).not.toContain("{datos_pago}");
  });

  it("omits the extras arg entirely (existing positional callers) — {precios}/{datos_pago} stay literal", () => {
    const body = "{precios}|{datos_pago}";
    const f = shapeFicha(clienteRow, [], [], HOY, HOY_ISO, TZ_FORGE, [{ id: "t1", nombre: "X", body }], "FORGE", 0);
    expect(f.mensajes[0].texto).toBe("{precios}|{datos_pago}");
  });

  it("a sin_paquete client gets sensible {dias} copy, never a fake day-0 countdown (#225 F1)", () => {
    const noPaquete: FichaClienteRow = {
      ...clienteRow,
      paquete_nombre: null,
      clases_restantes: null,
      vence: null,
    };
    const body = "Tu paquete vence en {dias} — ¿lo renovamos?";
    const f = shapeFicha(noPaquete, [], [], HOY, HOY_ISO, TZ_FORGE, [{ id: "t1", nombre: "Renovación", body }], "FORGE", 0);
    expect(f.cliente.estado).toBe("sin_paquete");
    expect(f.mensajes[0].texto).not.toContain("0 días"); // the fake countdown this closes
    expect(f.mensajes[0].texto).toBe("Tu paquete vence en sin paquete activo — ¿lo renovamos?");
  });

  it("an expired client's {dias} renders the signed day count, never the old 'vencido' (#225 F1)", () => {
    const vencido: FichaClienteRow = { ...clienteRow, vence: "2026-05-20" }; // hoy 2026-05-27 → dias -7
    const body = "Tu paquete vence en {dias} — ¿lo renovamos?";
    const f = shapeFicha(vencido, [], [], HOY, HOY_ISO, TZ_FORGE, [{ id: "t1", nombre: "Renovación", body }], "FORGE", 0);
    expect(f.cliente.estado).toBe("vencido");
    expect(f.mensajes[0].texto).toBe("Tu paquete vence en -7 días — ¿lo renovamos?");
    expect(f.mensajes[0].texto).not.toContain("vence en vencido"); // the #188 S12 defect
  });

  it("threads the pase-suelto catalog through to the ficha's estado (#225 F2) — matches the roster/export", () => {
    const paseSueltoRow: FichaClienteRow = {
      ...clienteRow,
      paquete_nombre: "1 clase",
      clases_restantes: 0, // spent — its NORMAL end state after one visit
      vence: "2026-06-20", // still inside its own validity window
    };
    const sinCatalogo = shapeFicha(paseSueltoRow, [], [], HOY, HOY_ISO, TZ_FORGE, [], "FORGE", 0);
    expect(sinCatalogo.cliente.estado).toBe("sin_clases"); // no catalog passed — the old, wrong reading

    const conCatalogo = shapeFicha(
      paseSueltoRow,
      [],
      [],
      HOY,
      HOY_ISO,
      TZ_FORGE,
      [],
      "FORGE",
      0,
      {},
      new Set(["1 clase"]),
    );
    expect(conCatalogo.cliente.estado).toBe("vigente"); // matches getClientesRoster/getRosterResumen/the export
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
    const f = shapeFicha(row, [], [venta({ clases: 8 })], HOY, HOY_ISO, TZ_FORGE, [], "FORGE", 1);
    expect(f.clasesGauge).not.toBeNull();
    expect(f.clasesGauge!.usadas).toBe(1);
    expect(f.clasesGauge!.fill).toBeCloseTo(23 / 24);
  });

  it("just-purchased reads ≈ full (nothing used yet)", () => {
    const row = { ...clienteRow, clases_restantes: 8 };
    const f = shapeFicha(row, [], [venta({ clases: 8 })], HOY, HOY_ISO, TZ_FORGE, [], "FORGE", 0);
    expect(f.clasesGauge!.fill).toBe(1);
    expect(f.clasesGauge!.usadas).toBe(0);
  });

  it("partially drained: clasesRest 3 + usadas 5 → fill 3/8", () => {
    const row = { ...clienteRow, clases_restantes: 3 };
    const f = shapeFicha(row, [], [venta({ clases: 8 })], HOY, HOY_ISO, TZ_FORGE, [], "FORGE", 5);
    expect(f.clasesGauge!.fill).toBeCloseTo(3 / 8);
    expect(f.clasesGauge!.usadas).toBe(5);
  });

  it("expired/forfeited (clasesRest 0) → empty clases bar, usadas reflects real count", () => {
    const row = { ...clienteRow, clases_restantes: 0 };
    const f = shapeFicha(row, [], [venta({ clases: 8 })], HOY, HOY_ISO, TZ_FORGE, [], "FORGE", 8);
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
      TZ_FORGE,
      [],
      "FORGE",
      0,
    );
    expect(f.clasesGauge).toBeNull();
    expect(f.diasGauge).not.toBeNull();
  });

  it("no ventas → both gauges null (no anchor)", () => {
    const f = shapeFicha(clienteRow, [], [], HOY, HOY_ISO, TZ_FORGE, [], "FORGE", 0);
    expect(f.clasesGauge).toBeNull();
    expect(f.diasGauge).toBeNull();
  });

  it("días fill from vence vs the last purchase date", () => {
    // purchased 2026-05-17, vence 2026-06-16 → denom 30; today 2026-05-27 → diasRest 20 → 20/30.
    const f = shapeFicha(clienteRow, [], [venta()], HOY, HOY_ISO, TZ_FORGE, [], "FORGE", 0);
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
      TZ_FORGE,
      [],
      "FORGE",
      0,
    );
    expect(f.diasGauge!.fill).toBe(0);
  });
});

describe("derivarMembresia", () => {
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
    fecha: "2026-05-17T18:00:00Z",
    paquete_nombre: "8 clases",
    monto: 800,
    metodo: "efectivo",
    clases: 8,
    vigencia_tipo: "dias",
    vigencia_dias: 30,
    ...over,
  });
  const mFacts = (over: Partial<MembresiaFacts> = {}): MembresiaFacts => ({
    paqueteNombre: "8 clases",
    clasesRestantes: 5,
    vence: "2026-06-16",
    anchorMonto: 800,
    anchorVigenciaTipo: "dias",
    anchorVigenciaDias: 30,
    attendedSincePurchase: 0,
    ...over,
  });

  // The load-bearing proof: fed the SAME scalars, derivarMembresia's gauge equals shapeFicha's
  // clasesGauge — the client plan card and the admin ficha are ONE derivation.
  it("gauge equals shapeFicha.clasesGauge for the same client (partially drained)", () => {
    const row = { ...clienteRow, clases_restantes: 3 };
    const ficha = shapeFicha(row, [], [venta()], HOY, HOY_ISO, TZ_FORGE, [], "FORGE", 5);
    const mem = derivarMembresia(mFacts({ clasesRestantes: 3, attendedSincePurchase: 5 }), HOY);
    expect(mem.gauge).not.toBeNull();
    expect(mem.gauge!.fill).toBeCloseTo(ficha.clasesGauge!.fill);
    expect(mem.gauge!.usadas).toBe(ficha.clasesGauge!.usadas);
    expect(mem.gauge!.fill).toBeCloseTo(3 / 8);
    expect(mem.gauge!.total).toBe(8);
    expect(mem.gauge!.restantes).toBe(3);
  });

  it("stacked balance: clasesRest 23 + usadas 1 → fill 23/24, matching the ficha", () => {
    const row = { ...clienteRow, clases_restantes: 23 };
    const ficha = shapeFicha(row, [], [venta()], HOY, HOY_ISO, TZ_FORGE, [], "FORGE", 1);
    const mem = derivarMembresia(mFacts({ clasesRestantes: 23, attendedSincePurchase: 1 }), HOY);
    expect(mem.gauge!.fill).toBeCloseTo(ficha.clasesGauge!.fill);
    expect(mem.gauge!.fill).toBeCloseTo(23 / 24);
  });

  it("expired/forfeited finite plan → clasesRest 0, empty bar (matches read-time forfeit)", () => {
    // vence in the past → forfeit to 0, exactly as derivarCliente/shapeFicha.
    const mem = derivarMembresia(mFacts({ clasesRestantes: 5, vence: "2026-05-20", attendedSincePurchase: 8 }), HOY);
    expect(mem.clasesRestLabel).toBe("0");
    expect(mem.vencido).toBe(true);
    expect(mem.gauge!.fill).toBe(0);
    expect(mem.gauge!.usadas).toBe(8);
  });

  it("ilimitado (clases_restantes NULL) → ∞, gauge hidden, cadence 'al mes'", () => {
    const mem = derivarMembresia(
      mFacts({ clasesRestantes: null, anchorVigenciaTipo: "mes", anchorVigenciaDias: null }),
      HOY,
    );
    expect(mem.ilimitado).toBe(true);
    expect(mem.vencido).toBe(false);
    expect(mem.clasesRestLabel).toBe("∞");
    expect(mem.gauge).toBeNull();
    expect(mem.cadenciaLabel).toBe("al mes");
  });

  it("expired ILIMITADO reads as vencido (#118 E3) — ∞ still lapses by date, unlike forfeit", () => {
    const mem = derivarMembresia(
      mFacts({ clasesRestantes: null, vence: "2026-05-20", anchorVigenciaTipo: "mes", anchorVigenciaDias: null }),
      HOY, // HOY = 27 May 2026, so vence 20 May is past
    );
    expect(mem.ilimitado).toBe(true); // forfeit leaves ∞ untouched…
    expect(mem.clasesRestLabel).toBe("∞");
    expect(mem.vencido).toBe(true); // …but the date signal fires independently (the bug)
  });

  it("vence-day itself is NOT vencido (dias === 0 is a valid training day, ruling C9)", () => {
    const mem = derivarMembresia(mFacts({ vence: HOY_ISO }), HOY); // vence === HOY
    expect(mem.vencido).toBe(false);
  });

  it("no anchor sale → no bar, no price, no cadence (still shows plan + renovación)", () => {
    const mem = derivarMembresia(
      mFacts({ anchorMonto: null, anchorVigenciaTipo: null, anchorVigenciaDias: null }),
      HOY,
    );
    expect(mem.gauge).toBeNull();
    expect(mem.precioDisplay).toBeNull();
    expect(mem.cadenciaLabel).toBeNull();
    expect(mem.planNombre).toBe("8 clases");
    expect(mem.renovacionDisplay).toBe("16 jun");
  });

  it("finite cadence renders the días window; price is the anchor monto", () => {
    const mem = derivarMembresia(mFacts({ anchorMonto: 800, anchorVigenciaTipo: "dias", anchorVigenciaDias: 20 }), HOY);
    expect(mem.precioDisplay).toBe("$800");
    expect(mem.cadenciaLabel).toBe("20 días");
  });
});

// ── Invite lifecycle (derived, never stored) ───────────────────────

function invFacts(over: Partial<InvitacionFacts> = {}): InvitacionFacts {
  return { email: null, invitacion_enviada_at: null, auth_user_id: null, ...over };
}

describe("estadoInvitacion — the pure state machine", () => {
  it("is sin_email when no email is captured", () => {
    expect(estadoInvitacion(invFacts())).toBe("sin_email");
  });

  it("is sin_invitar when email is set but no invite has been sent", () => {
    expect(estadoInvitacion(invFacts({ email: "ana@mail.com" }))).toBe("sin_invitar");
  });

  it("is invitacion_enviada once the invite has been sent", () => {
    expect(
      estadoInvitacion(invFacts({ email: "ana@mail.com", invitacion_enviada_at: "2026-07-08T18:00:00Z" })),
    ).toBe("invitacion_enviada");
  });

  it("is cuenta_activa once auth_user_id is sealed — regardless of the invite fields", () => {
    // auth wins even with no email / no invite sent (claim overwrites email later)
    expect(estadoInvitacion(invFacts({ auth_user_id: "u-1" }))).toBe("cuenta_activa");
    expect(
      estadoInvitacion(
        invFacts({ email: "ana@mail.com", invitacion_enviada_at: "2026-07-08T18:00:00Z", auth_user_id: "u-1" }),
      ),
    ).toBe("cuenta_activa");
  });
});

describe("derivarInvitacion — badge copy (es-MX)", () => {
  it("badges the three non-date states verbatim", () => {
    expect(derivarInvitacion(invFacts(), TZ_FORGE).badge).toBe("Sin email");
    expect(derivarInvitacion(invFacts({ email: "ana@mail.com" }), TZ_FORGE).badge).toBe("Sin invitar");
    expect(derivarInvitacion(invFacts({ auth_user_id: "u-1" }), TZ_FORGE).badge).toBe("Cuenta activa");
  });

  it("badges 'Invitada {fecha-corta}' with the gym-local send date", () => {
    // 8 jul 2026 03:00Z is still 7 jul in America/Chihuahua (UTC-6) → date is gym-local
    const d = derivarInvitacion(
      invFacts({ email: "ana@mail.com", invitacion_enviada_at: "2026-07-08T03:00:00Z" }),
      TZ_FORGE,
    );
    expect(d.estado).toBe("invitacion_enviada");
    expect(d.badge).toBe("Invitada 7 jul");
  });
});

describe("esRegistroOnlinePendiente — tile/filter population", () => {
  it("is true for an auth-linked member with no vigente package — any non-vigente estado (#225)", () => {
    expect(esRegistroOnlinePendiente("cuenta_activa", "sin_clases")).toBe(true);
    expect(esRegistroOnlinePendiente("cuenta_activa", "vencido")).toBe(true); // a lapsed online registrant
    expect(esRegistroOnlinePendiente("cuenta_activa", "sin_paquete")).toBe(true); // same-day online sign-up
  });

  it("is false for an auth-linked member who has a vigente package", () => {
    expect(esRegistroOnlinePendiente("cuenta_activa", "vigente")).toBe(false);
  });

  it("is false for a package-less desk/legacy client with no account", () => {
    // the exact cohort finding #12 says self-registrants were indistinguishable from
    expect(esRegistroOnlinePendiente("sin_email", "sin_clases")).toBe(false);
    expect(esRegistroOnlinePendiente("invitacion_enviada", "sin_clases")).toBe(false);
  });
});

describe("esPrimeraCompra — never-had-a-sale predicate (#77)", () => {
  it("is true only at zero ventas (boundary)", () => {
    expect(esPrimeraCompra(0)).toBe(true);
    expect(esPrimeraCompra(1)).toBe(false);
    expect(esPrimeraCompra(2)).toBe(false);
  });
});
