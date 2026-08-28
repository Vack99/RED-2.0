import { describe, expect, it } from "vitest";

import {
  derivarCliente,
  derivarInvitacion,
  derivarMembresia,
  derivarPaseCliente,
  diasDenom,
  esPrimeraCompra,
  estadoInvitacion,
  etiquetaClase,
  gaugeFill,
  momentoEnZona,
  RESET_EPOCH,
  saldoDetalle,
  shapeFicha,
  ventaAtribuida,
  type ClienteFacts,
  type EntradaSaldo,
  type FichaAsistRow,
  type FichaClienteRow,
  type FichaReservaRow,
  type FichaVentaRow,
  type InvitacionFacts,
  type MembresiaFacts,
} from "./derive";
import type { ContextoVeredicto } from "@gym/domain/lifecycle";

// Fixed "today" (27 May 2026) so every derivation below is deterministic.
const HOY_DIA = "2026-05-27";
/** The read's contexto — one gym day + an EMPTY pase-suelto catalog (the common
 *  fixture: this gym sells no drop-in). `CTX_PASE` below is the drop-in variant. */
const CTX: ContextoVeredicto = { hoy: HOY_DIA, pasesSueltos: new Set() };
/** The same contexto with "1 clase" classified as a drop-in (a catalog grant of 1). */
const CTX_PASE: ContextoVeredicto = { hoy: HOY_DIA, pasesSueltos: new Set(["1 clase"]) };

// shapeFicha's tz arg (slice #25, PRD #17 named exception): every ficha fixture
// below models the REAL Forge gym, whose gym row IS America/Chihuahua — a named
// test constant (not a re-introduced module-level default), mirroring the same
// gym-#1-fixture convention supabase/tests/toggle_pase_rules.sql already uses.
const TZ_FORGE = "America/Chihuahua";

/** The read's instant for every ficha fixture: 27 May 2026, 20:00Z = 14:00 Chihuahua. A class
 *  earlier that day has ENDED (a "No asistió — cargada" candidate); a later one is still an
 *  apartada. Fixed, so the noShow/apartada boundary never depends on when the suite runs. */
const AHORA = new Date("2026-05-27T20:00:00Z");
/** "This member has no bookings" — the common saldo input (§D1). */
const SIN_SALDO: EntradaSaldo = { reservas: [], cargadasFueraDeVentana: null, ahora: AHORA };
const conReservas = (reservas: FichaReservaRow[], cargadasFueraDeVentana: number | null = null): EntradaSaldo => ({
  reservas,
  cargadasFueraDeVentana,
  ahora: AHORA,
});

function facts(over: Partial<ClienteFacts> = {}): ClienteFacts {
  return {
    id: "c1",
    nombre: "Andrea Castro",
    tel: "614 218 3401",
    paquete_nombre: "8 clases",
    clases_restantes: 5,
    vence: "2026-06-16",
    auth_user_id: null,
    ...over,
  };
}

describe("derivarCliente", () => {
  it("is vigente with classes and time to spare", () => {
    const d = derivarCliente(facts(), CTX, 3, "no_leidas");
    expect(d.veredicto.estado).toBe("vigente");
    expect(d.veredicto.dias).toBe(20);
    expect(d.veredicto.clases).toBe(5);
    expect(d.clasesRestLabel).toBe("5");
    expect(d.venceDisplay).toBe("16 jun");
    expect(d.inicial).toBe("AC");
    expect(d.asistEsteMes).toBe(3);
  });

  it("is vigente at few days/classes left — the old por_vencer split is retired (#225)", () => {
    // 3 días left: pre-#225 this was "por_vencer" (<= 5 days). That threshold now lives
    // in urgenciaCliente/the POR RENOVAR tile, never in estado.
    expect(derivarCliente(facts({ vence: "2026-05-30" }), CTX, 0, "no_leidas").veredicto.estado).toBe("vigente");
    // 2 clases left: pre-#225 this was "por_vencer" (<= 2 clases) too.
    expect(
      derivarCliente(facts({ clases_restantes: 2, vence: "2026-06-20" }), CTX, 0, "no_leidas").veredicto.estado,
    ).toBe("vigente");
  });

  it("is sin_clases when out of classes with days remaining", () => {
    const d = derivarCliente(facts({ clases_restantes: 0, vence: "2026-06-20" }), CTX, 0, "no_leidas");
    expect(d.veredicto.estado).toBe("sin_clases");
  });

  it("forfeits remaining classes once expired (read-time) and is vencido, never sin_clases — FECHA WINS (A2)", () => {
    const d = derivarCliente(facts({ clases_restantes: 5, vence: "2026-05-25" }), CTX, 0, "no_leidas");
    expect(d.veredicto.dias).toBe(-2);
    expect(d.veredicto.clases).toBe(0); // forfeited
    expect(d.veredicto.estado).toBe("vencido");
  });

  it("keeps ilimitado vigente", () => {
    const d = derivarCliente(
      facts({ clases_restantes: null, paquete_nombre: "Ilimitado", vence: "2026-06-30" }),
      CTX,
      9,
      "no_leidas",
    );
    expect(d.veredicto.clases).toBe("ilimitado");
    expect(d.clasesRestLabel).toBe("∞");
    expect(d.veredicto.estado).toBe("vigente");
  });

  it("never forfeits ilimitado but still expires by date", () => {
    const d = derivarCliente(
      facts({ clases_restantes: null, paquete_nombre: "Ilimitado", vence: "2026-05-25" }),
      CTX,
      0,
      "no_leidas",
    );
    expect(d.veredicto.clases).toBe("ilimitado");
    expect(d.veredicto.estado).toBe("vencido"); // expired
  });

  it("handles a client with no package — sin_paquete, distinct from sin_clases (#225)", () => {
    const d = derivarCliente(
      facts({ paquete_nombre: null, clases_restantes: null, vence: null }),
      CTX,
      0,
      "no_leidas",
    );
    expect(d.veredicto.estado).toBe("sin_paquete");
    expect(d.veredicto.clases).toBe(0);
    expect(d.veredicto.dias).toBeNull(); // no package, no countdown — never a fabricated 0
    expect(d.venceDisplay).toBe("—");
    expect(d.paquete).toBe("Sin paquete");
  });

  it("the ctx's catalog exempts a spent one-off pass from sin_clases (matches the catalog, not the balance)", () => {
    const d = derivarCliente(
      facts({ paquete_nombre: "1 clase", clases_restantes: 0, vence: "2026-06-20" }),
      CTX_PASE,
      0,
      "no_leidas",
    );
    expect(d.veredicto.estado).toBe("vigente");
  });

  it("derives pendienteOnline from the row's own auth link — no second producer to keep in step (#227 F1)", () => {
    const fresco = facts({ paquete_nombre: null, clases_restantes: null, vence: null, auth_user_id: "u-1" });
    expect(derivarCliente(fresco, CTX, 0, "no_leidas").veredicto.pendienteOnline).toBe(true);
    // A lapsed account-holder is a plain vencido, never a "fresh arrival".
    const lapso = facts({ vence: "2026-05-25", auth_user_id: "u-1" });
    expect(derivarCliente(lapso, CTX, 0, "no_leidas").veredicto.pendienteOnline).toBe(false);
    // No account at all → never pendienteOnline, however package-less.
    const sinCuenta = facts({ paquete_nombre: null, clases_restantes: null, vence: null });
    expect(derivarCliente(sinCuenta, CTX, 0, "no_leidas").veredicto.pendienteOnline).toBe(false);
  });

  it("reports ausencia only when the caller actually read the visit aggregate", () => {
    expect(derivarCliente(facts(), CTX, 0, "no_leidas").veredicto.ausencia).toBeNull();
    const conVisitas = derivarCliente(
      facts(),
      CTX,
      0,
      { ultima: "2026-05-01", ultimaConsumida: "2026-05-01", alta: "2026-01-01" },
    );
    expect(conVisitas.veredicto.ausencia).toEqual({ dias: 26, ausente: true });
  });
});

describe("derivarPaseCliente", () => {
  it("flags porRenovar on the CLASES dimension (<= RENOVACION_CLASES) even with days to spare", () => {
    // 1 class left, 24 days left: POR RENOVAR's clases arm fires at <= RENOVACION_CLASES (1).
    const p = derivarPaseCliente(facts({ clases_restantes: 1, vence: "2026-06-20" }), CTX);
    expect(p.diasRest).toBe(24);
    expect(p.porRenovar).toBe(true);
    expect(p.clasesLabel).toBe("1 clase");
  });

  it("flags porRenovar on the DÍAS dimension (<= RENOVACION_DIAS)", () => {
    const p = derivarPaseCliente(facts({ clases_restantes: 8, vence: "2026-05-30" }), CTX);
    expect(p.diasRest).toBe(3);
    expect(p.porRenovar).toBe(true);
  });

  it("is not porRenovar when both dimensions are healthy", () => {
    const p = derivarPaseCliente(facts({ clases_restantes: 8, vence: "2026-06-20" }), CTX);
    expect(p.porRenovar).toBe(false);
    expect(p.clasesLabel).toBe("8 clases");
  });

  it("is not porRenovar once expired (estado vencido — never a POR RENOVAR candidate)", () => {
    const p = derivarPaseCliente(facts({ clases_restantes: 5, vence: "2026-05-25" }), CTX);
    expect(p.porRenovar).toBe(false);
  });

  it("labels ilimitado and never flags it on clases", () => {
    const p = derivarPaseCliente(
      facts({ clases_restantes: null, paquete_nombre: "Ilimitado", vence: "2026-06-20" }),
      CTX,
    );
    expect(p.clasesLabel).toBe("Ilimitado");
    expect(p.porRenovar).toBe(false);
  });

  it("exempts a spent one-off pass from the clases arm — the SAME catalog the roster reads", () => {
    const p = derivarPaseCliente(
      facts({ paquete_nombre: "1 clase", clases_restantes: 0, vence: "2026-06-20" }),
      CTX_PASE,
    );
    expect(p.porRenovar).toBe(false);
  });

  it("handles a client with no package", () => {
    const p = derivarPaseCliente(
      facts({ paquete_nombre: null, clases_restantes: null, vence: null }),
      CTX,
    );
    expect(p.clasesLabel).toBe("Sin paquete");
    expect(p.diasRest).toBe(0); // no countdown to render
    expect(p.porRenovar).toBe(false);
  });
});

describe("shapeFicha", () => {
  // Mid-day UTC so the Chihuahua-local calendar day is unambiguous for either -6/-7.
  const clienteRow: FichaClienteRow = {
    id: "c1",
    nombre: "Andrea Castro",
    tel: "614 218 3401",
    paquete_nombre: "8 clases",
    clases_restantes: 5,
    vence: "2026-06-16",
    auth_user_id: null,
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
    id: "v1",
    folio: 1001,
    fecha: "2026-05-20T18:00:00Z",
    created_at: "2026-05-20T18:00:00Z",
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
      { fecha: "2026-05-27", hora: "07:30:00", consumio: true, perdonada: false, reservation_id: null, class_session_id: null, origen: "libre", class_session: null }, // today
      { fecha: "2026-05-25", hora: "08:15:00", consumio: true, perdonada: false, reservation_id: null, class_session_id: null, origen: "libre", class_session: null },
      { fecha: "2026-05-20", hora: null, consumio: true, perdonada: false, reservation_id: null, class_session_id: null, origen: "libre", class_session: null }, // back-entry, no time
    ];
    const f = shapeFicha(clienteRow, asist, [], CTX, TZ_FORGE, [], "FORGE");
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
      [{ fecha: HOY_DIA, hora: "18:05:00", consumio: true, perdonada: false, reservation_id: null, class_session_id: "s9", origen: "clase", class_session: sesion() }],
      [],
      CTX,
      TZ_FORGE,
      [],
      "FORGE",
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
        { fecha: HOY_DIA, hora: "07:30:00", consumio: true, perdonada: false, reservation_id: null, class_session_id: null, origen: "libre", class_session: null },
        { fecha: HOY_DIA, hora: null, consumio: false, perdonada: false, reservation_id: null, class_session_id: "s9", origen: "clase", class_session: sesion() },
      ],
      [],
      CTX,
      TZ_FORGE,
      [],
      "FORGE",
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
        { fecha: "2026-05-25", hora: "23:11:04", consumio: true, perdonada: false, reservation_id: null, class_session_id: "s1", origen: "clase", class_session: sesion() },
        {
          fecha: "2026-05-25",
          hora: "23:11:21",
          consumio: true,
          perdonada: false,
          reservation_id: null,
          class_session_id: "s2",
          origen: "clase",
          class_session: sesion({ starts_at: "2026-05-25T13:00:00Z", class_type: { name: "YOGA" } }),
        },
        { fecha: "2026-05-24", hora: "08:15:00", consumio: true, perdonada: false, reservation_id: null, class_session_id: null, origen: "libre", class_session: null },
      ],
      [],
      CTX,
      TZ_FORGE,
      [],
      "FORGE",
    );
    expect(f.historial).toHaveLength(3);
    expect(f.historial[0]).toEqual({
      dDisplay: "lun 25",
      hora: "23:11",
      today: false,
      clase: "METCON 19:45",
      origen: "clase",
      tipo: "visita",
      // No ventas in this fixture → no anchor → nothing can be "the previous package".
      paqueteAnterior: false,
    });
    expect(f.historial[1].clase).toBe("YOGA 07:00");
    // ACCESO LIBRE carries no class — the leaf labels it (one home for that copy).
    expect(f.historial[2].clase).toBeNull();
  });

  // The leaf's label fallback (cliente-detalle.tsx): `row.clase ?? (row.origen === "libre" ?
  // "ACCESO LIBRE" : "—")`. shapeFicha doesn't render that copy, but it owns the `origen`
  // plumbing the leaf depends on — these three cases are the ones that copy branches on.
  it("carries `origen` through the historial row for the leaf's label fallback (#178)", () => {
    const f = shapeFicha(
      clienteRow,
      [
        // 1. A class visit — `clase` is set, so the leaf never even looks at `origen`.
        { fecha: "2026-05-25", hora: "18:05:00", consumio: true, perdonada: false, reservation_id: null, class_session_id: "s1", origen: "clase", class_session: sesion() },
        // 2. A real ACCESO LIBRE visit (post-#89) — `clase` null, `origen` 'libre'.
        { fecha: "2026-05-24", hora: "08:00:00", consumio: true, perdonada: false, reservation_id: null, class_session_id: null, origen: "libre", class_session: null },
        // 3. A pre-#89 row — `clase` null, `origen` null (provenance unknown, never ACCESO LIBRE).
        { fecha: "2026-05-23", hora: "09:00:00", consumio: true, perdonada: false, reservation_id: null, class_session_id: null, origen: null, class_session: null },
      ],
      [],
      CTX,
      TZ_FORGE,
      [],
      "FORGE",
    );
    expect(f.historial[0].clase).toBe("METCON 19:45");
    expect(f.historial[1]).toMatchObject({ clase: null, origen: "libre" });
    expect(f.historial[2]).toMatchObject({ clase: null, origen: null });
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
      venta({
        id: "v2",
        paquete_nombre: "Ilimitado",
        monto: 1200,
        metodo: "transferencia",
        clases: null,
        vigencia_tipo: "mes",
        vigencia_dias: null,
      }),
    ];
    const f = shapeFicha(clienteRow, [], ventas, CTX, TZ_FORGE, [], "FORGE");
    expect(f.pagos[0]).toEqual({
      id: "v1",
      folio: 1001,
      fechaDisplay: "20 may",
      paquete: "8 clases",
      montoDisplay: "$800",
      metodoDisplay: "Efectivo",
      monto: 800,
      metodo: "efectivo",
      fecha: "2026-05-20T18:00:00Z",
      // 18:00Z = 12:00 Chihuahua (-6) — the gym's calendar day, the picker's seed.
      fechaIso: "2026-05-20",
      clases: 8,
      vigenciaTipo: "dias",
      vigenciaDias: 30,
      createdAt: "2026-05-20T18:00:00Z",
      mes: "mayo",
    });
    expect(f.pagos[1].metodoDisplay).toBe("Transferencia");
    expect(f.ventasCount).toBe(2);
    expect(f.primeraCompra).toBe(false); // has sales
    expect(f.totalClases).toBe(8); // latest = ventas[0]
    expect(f.dayDenom).toBe(30);
    expect(f.compradoDisplay).toBe("20 may");
  });

  it("exposes the raw clasesRestantes/vence balance alongside the display strings (#269)", () => {
    const f = shapeFicha(clienteRow, [], [], CTX, TZ_FORGE, [], "FORGE");
    expect(f.clasesRestantes).toBe(5);
    expect(f.vence).toBe("2026-06-16");
  });

  it("resolves a pago's fechaIso in the GYM's zone, not UTC — the picker seeds from it", () => {
    // 03:00Z on the 21st is still 21:00 on the 20th in Chihuahua (-6): seeding the picker
    // from the UTC day would open it on a date the sale was never made on.
    const f = shapeFicha(clienteRow, [], [venta({ fecha: "2026-05-21T03:00:00Z" })], CTX, TZ_FORGE, [], "FORGE");
    expect(f.pagos[0].fechaIso).toBe("2026-05-20");
  });

  it("derives altaDisplay as the gym-tz day of created_at", () => {
    const f = shapeFicha(clienteRow, [], [], CTX, TZ_FORGE, [], "FORGE");
    expect(f.altaDisplay).toBe("10 abr");
  });

  it("flags primeraCompra when the member has no ventas (#77)", () => {
    expect(shapeFicha(clienteRow, [], [], CTX, TZ_FORGE, [], "FORGE").primeraCompra).toBe(true);
    expect(
      shapeFicha(clienteRow, [], [venta()], CTX, TZ_FORGE, [], "FORGE").primeraCompra,
    ).toBe(false);
  });

  it("dayDenom falls back to 30 for mes packages, no ventas, AND a 0 vigencia_dias (divide-by-zero guard)", () => {
    expect(shapeFicha(clienteRow, [], [], CTX, TZ_FORGE, [], "FORGE").dayDenom).toBe(30);
    expect(
      shapeFicha(clienteRow, [], [venta({ vigencia_tipo: "mes", vigencia_dias: null })], CTX, TZ_FORGE, [], "FORGE").dayDenom,
    ).toBe(30);
    expect(
      shapeFicha(clienteRow, [], [venta({ vigencia_dias: 0 })], CTX, TZ_FORGE, [], "FORGE").dayDenom,
    ).toBe(30); // the `|| 30` guard, not `?? 30`
  });

  it("renders mensajes from the templates for the derived saldo + negocio", () => {
    const body = "Hola {nombre}, te quedan {clases} de tu {paquete} (vence {vence}). — {negocio}";
    const f = shapeFicha(clienteRow, [], [], CTX, TZ_FORGE, [{ id: "t1", nombre: "Recordatorio", body }], "FORGE GYM");
    expect(f.mensajes).toEqual([
      { id: "t1", nombre: "Recordatorio", texto: "Hola Andrea, te quedan 5 clases de tu 8 clases (vence 16 jun). — FORGE GYM" },
    ]);
    expect(f.cliente.veredicto.estado).toBe("vigente");
  });

  it("resolves the {dias}/{precios}/{datos_pago} tokens from the derived diasRest + the extras arg", () => {
    // vence 2026-06-16, hoy 2026-05-27 → diasRest 20 → fmtDias "vence en 20 días" (the token carries
    // the whole verb phrase, #226 — the body embeds it directly, no "vence en" prefix of its own).
    const body = "Tu paquete {dias}.\nPrecios:\n{precios}\nPago:\n{datos_pago}";
    const f = shapeFicha(
      clienteRow,
      [],
      [],
      CTX,
      TZ_FORGE,
      [{ id: "t1", nombre: "Renovación", body }],
      "FORGE",
      SIN_SALDO,
      { precios: "• 8 clases — $800", datos_pago: "Transferencia: BBVA" },
    );
    expect(f.mensajes[0].texto).toBe(
      "Tu paquete vence en 20 días.\nPrecios:\n• 8 clases — $800\nPago:\nTransferencia: BBVA",
    );
    // No leftover literal placeholders.
    expect(f.mensajes[0].texto).not.toContain("{dias}");
    expect(f.mensajes[0].texto).not.toContain("{precios}");
    expect(f.mensajes[0].texto).not.toContain("{datos_pago}");
  });

  it("omits the extras arg entirely (existing positional callers) — {precios}/{datos_pago} stay literal", () => {
    const body = "{precios}|{datos_pago}";
    const f = shapeFicha(clienteRow, [], [], CTX, TZ_FORGE, [{ id: "t1", nombre: "X", body }], "FORGE");
    expect(f.mensajes[0].texto).toBe("{precios}|{datos_pago}");
  });

  it("a sin_paquete client gets sensible {dias} copy, never a fake day-0 countdown (#225 F1)", () => {
    const noPaquete: FichaClienteRow = {
      ...clienteRow,
      paquete_nombre: null,
      clases_restantes: null,
      vence: null,
    };
    // #226: the body no longer hardcodes "vence en" — {dias} carries the whole verb phrase, so a
    // custom template embeds the token directly, same as the reseeded Renovación body.
    const body = "Tu paquete {dias} — ¿lo renovamos?";
    const f = shapeFicha(noPaquete, [], [], CTX, TZ_FORGE, [{ id: "t1", nombre: "Renovación", body }], "FORGE");
    expect(f.cliente.veredicto.estado).toBe("sin_paquete");
    expect(f.mensajes[0].texto).not.toContain("0 días"); // the fake countdown this closes
    expect(f.mensajes[0].texto).not.toContain("vence en vencido"); // the #188 S12 defect
    // #226 F8: a VERB phrase ("ya no está activo"), not the noun phrase "sin paquete activo" —
    // the fixed "vence en" prefix is gone, so the substitution must read as a sentence on its own.
    expect(f.mensajes[0].texto).toBe("Tu paquete ya no está activo — ¿lo renovamos?");
  });

  it("an expired client's {dias} renders the direction-aware verb phrase, never 'vencido' (#226, closes #225 F1's residual)", () => {
    const vencido: FichaClienteRow = { ...clienteRow, vence: "2026-05-20" }; // hoy 2026-05-27 → dias -7
    const body = "Tu paquete {dias} — ¿lo renovamos?";
    const f = shapeFicha(vencido, [], [], CTX, TZ_FORGE, [{ id: "t1", nombre: "Renovación", body }], "FORGE");
    expect(f.cliente.veredicto.estado).toBe("vencido");
    expect(f.mensajes[0].texto).toBe("Tu paquete venció hace 7 días — ¿lo renovamos?");
    expect(f.mensajes[0].texto).not.toContain("vence en vencido"); // the #188 S12 defect
  });

  it("the contexto's catalog is REQUIRED, so the ficha's estado + urgencia match the roster/export (#225 F2)", () => {
    const paseSueltoRow: FichaClienteRow = {
      ...clienteRow,
      paquete_nombre: "1 clase",
      clases_restantes: 0, // spent — its NORMAL end state after one visit
      vence: "2026-06-20", // still inside its own validity window
    };
    // The catalog can no longer be omitted (it was an optional trailing param, and a
    // caller that dropped it painted this row SIN CLASES/"Crítico" while the roster
    // read it VIGENTE/"ok"): the ONLY way to say "this gym sells no drop-in" is an
    // explicitly empty Set, which for THIS row is a different, stated fact.
    const sinCatalogo = shapeFicha(paseSueltoRow, [], [], CTX, TZ_FORGE, [], "FORGE");
    expect(sinCatalogo.cliente.veredicto.estado).toBe("sin_clases");

    const conCatalogo = shapeFicha(paseSueltoRow, [], [], CTX_PASE, TZ_FORGE, [], "FORGE");
    expect(conCatalogo.cliente.veredicto.estado).toBe("vigente"); // matches the roster/dashboard/export
    // …and the urgencia the ficha's `urgente` accent reads, blind to the spent clases:
    // this pairing is the tri-surface drift the deepening closes.
    expect(conCatalogo.cliente.veredicto.urgencia.nivel).toBe("ok");
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

  it("diasDenom = days from the last purchase to vence", () => {
    expect(diasDenom(new Date(2026, 5, 16), new Date(2026, 4, 17))).toBe(30);
    expect(diasDenom(new Date(2026, 5, 16), new Date(2026, 5, 16))).toBe(0); // same day
  });
});

describe("shapeFicha gauges", () => {
  const clienteRow: FichaClienteRow = {
    id: "c1",
    nombre: "Andrea Castro",
    tel: "614 218 3401",
    paquete_nombre: "8 clases",
    clases_restantes: 5,
    vence: "2026-06-16",
    auth_user_id: null,
    created_at: "2026-04-10T18:00:00Z",
  };
  const venta = (over: Partial<FichaVentaRow> = {}): FichaVentaRow => ({
    id: "v1",
    folio: 1001,
    fecha: "2026-05-17T18:00:00Z", // purchased 10 days ago; vence 2026-06-16 → 30-day window
    created_at: "2026-05-17T18:00:00Z",
    paquete_nombre: "8 clases",
    monto: 800,
    metodo: "efectivo",
    clases: 8,
    vigencia_tipo: "dias",
    vigencia_dias: 30,
    ...over,
  });

  /** N asistencia marks after the venta instant (2026-05-17 12:00 Chihuahua), one per day back
   *  from 2026-05-26 — all inside the pack, none on `hoy`. */
  const marcas = (n: number): FichaAsistRow[] =>
    Array.from({ length: n }, (_, i) => ({
      fecha: `2026-05-${String(26 - i).padStart(2, "0")}`,
      hora: "18:00:00",
      consumio: true,
      perdonada: false,
      reservation_id: null,
      class_session_id: null,
      origen: "libre" as const,
      class_session: null,
    }));

  // §D2: the denominator is the anchor's GRANT, never `restantes + usadas`. A stacked balance
  // (23 left on an 8-pack) used to paint 23/24 — a plausible-looking bar over a number the pack
  // could never have granted. It now pins to the grant and the clamp does the rest.
  it("stacked balance (23 left on an 8-pack) pins to the GRANT and clamps at full", () => {
    const row = { ...clienteRow, clases_restantes: 23 };
    const f = shapeFicha(row, marcas(1), [venta({ clases: 8 })], CTX, TZ_FORGE, [], "FORGE");
    expect(f.clasesGauge).not.toBeNull();
    expect(f.clasesGauge!.total).toBe(8);
    expect(f.clasesGauge!.usadas).toBe(1);
    expect(f.clasesGauge!.fill).toBe(1); // 23/8 clamped, not 23/24
  });

  it("just-purchased reads ≈ full (nothing used yet)", () => {
    const row = { ...clienteRow, clases_restantes: 8 };
    const f = shapeFicha(row, [], [venta({ clases: 8 })], CTX, TZ_FORGE, [], "FORGE");
    expect(f.clasesGauge!.fill).toBe(1);
    expect(f.clasesGauge!.usadas).toBe(0);
    expect(f.clasesGauge!.apartadas).toBe(0);
  });

  it("partially drained: clasesRest 3 of an 8-pack → fill 3/8, usadas is the §D0 charge count", () => {
    const row = { ...clienteRow, clases_restantes: 3 };
    const f = shapeFicha(row, marcas(5), [venta({ clases: 8 })], CTX, TZ_FORGE, [], "FORGE");
    expect(f.clasesGauge!.fill).toBeCloseTo(3 / 8);
    expect(f.clasesGauge!.usadas).toBe(5);
    expect(f.clasesGauge!.total).toBe(8);
  });

  it("expired/forfeited (clasesRest 0) → empty clases bar, usadas reflects real count", () => {
    const row = { ...clienteRow, clases_restantes: 0 };
    const f = shapeFicha(row, marcas(8), [venta({ clases: 8 })], CTX, TZ_FORGE, [], "FORGE");
    expect(f.clasesGauge!.fill).toBe(0);
    expect(f.clasesGauge!.usadas).toBe(8);
  });

  // The fill reads the SAME forfeited number the big número prints, so the bar can never say
  // "you have 5" over a screen that says 0. The RAW balance still rides on `saldo.restantes`,
  // which is what the invariant/discrepancia are computed from.
  it("an expired pack empties the bar even with a RAW balance left — saldo.restantes keeps the raw number", () => {
    const row = { ...clienteRow, clases_restantes: 5, vence: "2026-05-20" }; // hoy = 2026-05-27
    const f = shapeFicha(row, [], [venta({ clases: 8 })], CTX, TZ_FORGE, [], "FORGE");
    expect(f.cliente.clasesRestLabel).toBe("0");
    expect(f.clasesGauge!.fill).toBe(0);
    expect(f.saldo.restantes).toBe(5);
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
      CTX,
      TZ_FORGE,
      [],
      "FORGE",
    );
    expect(f.clasesGauge).toBeNull();
    expect(f.diasGauge).not.toBeNull();
  });

  it("no ventas → both gauges null (no anchor)", () => {
    const f = shapeFicha(clienteRow, [], [], CTX, TZ_FORGE, [], "FORGE");
    expect(f.clasesGauge).toBeNull();
    expect(f.diasGauge).toBeNull();
  });

  it("días fill from vence vs the last purchase date", () => {
    // purchased 2026-05-17, vence 2026-06-16 → denom 30; today 2026-05-27 → diasRest 20 → 20/30.
    const f = shapeFicha(clienteRow, [], [venta()], CTX, TZ_FORGE, [], "FORGE");
    expect(f.diasGauge!.fill).toBeCloseTo(20 / 30);
  });

  it("días denom <= 0 (purchased on/after vence) clamps fill to its bounds", () => {
    // Degenerate venta dated the same day as vence → denom 0 → empty bar, no divide-by-zero.
    const f = shapeFicha(
      clienteRow,
      [],
      [venta({ fecha: "2026-06-16T18:00:00Z" })],
      CTX,
      TZ_FORGE,
      [],
      "FORGE",
    );
    expect(f.diasGauge!.fill).toBe(0);
  });
});

// ── §D0/§D1 · the cargable rule and the derived balance ────────────
// The vector list the slice-2 spec makes mandatory, run here in TS against the SAME rule the
// SQL helper implements. Each vector names the wrong implementation it kills.

describe("saldoDetalle — §D0 counting + §D1 derivation", () => {
  // Anchor sale: written 2026-05-17 12:00 Chihuahua (UTC−6).
  const ANCLA_ISO = "2026-05-17T18:00:00Z";
  const venta = (over: Partial<FichaVentaRow> = {}): FichaVentaRow => ({
    id: "v1",
    folio: 1001,
    fecha: ANCLA_ISO,
    created_at: ANCLA_ISO,
    paquete_nombre: "8 clases",
    monto: 800,
    metodo: "efectivo",
    clases: 8,
    vigencia_tipo: "dias",
    vigencia_dias: 30,
    ...over,
  });
  const marca = (over: Partial<FichaAsistRow> = {}): FichaAsistRow => ({
    fecha: "2026-05-20",
    hora: "18:00:00",
    consumio: true,
    perdonada: false,
    reservation_id: null,
    class_session_id: null,
    origen: "libre",
    class_session: null,
    ...over,
  });
  /** A booking held 2026-05-20 12:00 local for a class that ran 2026-05-25 07:00 local — over
   *  long before `AHORA` (2026-05-27 14:00 local). */
  const reserva = (over: Partial<FichaReservaRow> = {}): FichaReservaRow => ({
    id: "r1",
    created_at: "2026-05-20T18:00:00Z",
    consumio: true,
    status: "reservada",
    class_session_id: "s1",
    class_session: {
      starts_at: "2026-05-25T13:00:00Z",
      duration_min: 60,
      is_special: false,
      special_name: null,
      class_type: { name: "METCON" },
    },
    ...over,
  });
  const SESION_FUTURA = {
    starts_at: "2026-05-28T01:00:00Z", // 2026-05-27 19:00 local — five hours after AHORA
    duration_min: 60,
    is_special: false,
    special_name: null,
    class_type: { name: "METCON" },
  };

  it("grant − charges: 3 marks on an 8-pack derive 5, and a healthy member's discrepancia is 0", () => {
    const s = saldoDetalle(5, [venta()], [marca(), marca({ fecha: "2026-05-21" }), marca({ fecha: "2026-05-22" })], TZ_FORGE, SIN_SALDO);
    expect(s.anchor).toMatchObject({ ventaId: "v1", folio: 1001, grant: 8 });
    expect(s.usadas).toBe(3);
    expect(s.derived).toBe(5);
    expect(s.discrepancia).toBe(0);
    expect(s.mostrarDiscrepancia).toBe(false);
  });

  // AC4's invariant, stated as arithmetic: on a healthy member the three numbers the ficha
  // prints have to add back up to the number the gym sold.
  it("AC4: usadas + apartadas + restantes = grant", () => {
    const s = saldoDetalle(
      4,
      [venta()],
      [marca(), marca({ fecha: "2026-05-21" }), marca({ fecha: "2026-05-22" })],
      TZ_FORGE,
      conReservas([reserva({ id: "r-fut", created_at: "2026-05-26T18:00:00Z", class_session: SESION_FUTURA })]),
    );
    expect(s.usadas).toBe(3);
    expect(s.apartadas).toBe(1);
    expect(s.usadas + s.apartadas + (s.restantes ?? 0)).toBe(8);
    expect(s.discrepancia).toBe(0);
  });

  it("clamps nothing: a hand-broken balance is REPORTED as a discrepancia, never absorbed", () => {
    const s = saldoDetalle(7, [venta()], [marca(), marca({ fecha: "2026-05-21" })], TZ_FORGE, SIN_SALDO);
    expect(s.derived).toBe(6);
    expect(s.discrepancia).toBe(-1);
  });

  // The vector that kills a consumio=true-only implementation: attending while ilimitado charges
  // nothing at the time, but as-if-original still counts the event.
  it("counts a consumio=false mark (attended while ilimitado / already charged at booking)", () => {
    const s = saldoDetalle(7, [venta()], [marca({ consumio: false })], TZ_FORGE, SIN_SALDO);
    expect(s.usadas).toBe(1);
  });

  it("excludes a perdonada mark (the cooldown twin, never a second charge)", () => {
    const s = saldoDetalle(8, [venta()], [marca({ perdonada: true })], TZ_FORGE, SIN_SALDO);
    expect(s.usadas).toBe(0);
  });

  it("booked → checked-in is counted ONCE: the mark defers to the reservation leg", () => {
    const s = saldoDetalle(
      7,
      [venta()],
      [marca({ fecha: "2026-05-25", hora: "07:02:00", consumio: false, reservation_id: "r1", class_session_id: "s1" })],
      TZ_FORGE,
      conReservas([reserva({ status: "asistida" })]),
    );
    expect(s.usadas).toBe(1);
    expect(s.noShows).toBe(0); // it WAS attended
  });

  // The walk-in-after-cancel stale-flag row: `pasar_lista_sesion` reuses the cancelled booking and
  // (pre-D6) leaves `consumio` true. Both legs see it; the dedupe is what keeps it at one.
  it("walk-in reusing a cancelled booking is counted ONCE (the stale consumio flag)", () => {
    const s = saldoDetalle(
      7,
      [venta()],
      [marca({ fecha: "2026-05-25", hora: "07:02:00", consumio: true, reservation_id: "r1", class_session_id: "s1" })],
      TZ_FORGE,
      conReservas([reserva({ status: "asistida", consumio: true })]),
    );
    expect(s.usadas).toBe(1);
  });

  it("a gym-cancelled session lands NOWHERE — the status filter, not consumio, is what excludes it", () => {
    // cancel_class_session refunds the class and stamps 'cancelada' while leaving consumio true.
    const s = saldoDetalle(8, [venta()], [], TZ_FORGE, conReservas([reserva({ status: "cancelada" })]));
    expect(s.usadas).toBe(0);
    expect(s.apartadas).toBe(0);
    expect(s.noShows).toBe(0);
  });

  it("a member-cancelled booking lands nowhere either (refund already live)", () => {
    const s = saldoDetalle(8, [venta()], [], TZ_FORGE, conReservas([reserva({ status: "cancelada", consumio: false })]));
    expect(s.usadas).toBe(0);
  });

  it("noShow vs apartada is the session END, not its start: in-progress is still an apartada", () => {
    const enCurso = {
      ...SESION_FUTURA,
      starts_at: "2026-05-27T19:45:00Z", // 13:45 local — started 15 min before AHORA, 60 min long
    };
    const s = saldoDetalle(7, [venta()], [], TZ_FORGE, conReservas([reserva({ class_session: enCurso })]));
    expect(s.apartadas).toBe(1);
    expect(s.usadas).toBe(0);
    expect(s.noShows).toBe(0);
  });

  it("a charged booking whose class ENDED with no check-in is a noShow — counted in usadas", () => {
    const s = saldoDetalle(7, [venta()], [], TZ_FORGE, conReservas([reserva()]));
    expect(s.usadas).toBe(1);
    expect(s.noShows).toBe(1);
    expect(s.apartadas).toBe(0);
  });

  it("'asistida' alone clears the noShow claim — the mark may sit outside the fetched window", () => {
    const s = saldoDetalle(7, [venta()], [], TZ_FORGE, conReservas([reserva({ status: "asistida" })]));
    expect(s.usadas).toBe(1);
    expect(s.noShows).toBe(0);
  });

  // Berenice (AC1). The mark is at 18:12 LOCAL on 21 May; the renewal is written 02:53Z on 22 May,
  // which is 20:53 local on 21 May. A naive UTC `::date` reads the sale as the NEXT day and hands
  // the mark to the new pack — this vector is the one that catches it.
  it("a mark hours BEFORE a same-day renewal stays on the OLD pack (timezone-aware)", () => {
    const nueva = venta({ id: "v2", folio: 1002, created_at: "2026-05-22T02:53:00Z", fecha: "2026-05-22T02:53:00Z" });
    const s = saldoDetalle(
      8,
      [nueva, venta()], // created_at desc, as the DAL orders it
      [marca({ fecha: "2026-05-21", hora: "18:12:00" })],
      TZ_FORGE,
      SIN_SALDO,
    );
    expect(s.anchor!.ventaId).toBe("v2");
    expect(s.usadas).toBe(0); // it was spent from the pre-renewal balance
    expect(s.discrepancia).toBe(0);
  });

  it("a rebook AFTER a renewal attributes to the NEW venta", () => {
    const nueva = venta({ id: "v2", folio: 1002, created_at: "2026-05-22T02:53:00Z", fecha: "2026-05-22T02:53:00Z" });
    const s = saldoDetalle(
      7,
      [nueva, venta()],
      [],
      TZ_FORGE,
      conReservas([reserva({ created_at: "2026-05-23T18:00:00Z", status: "asistida" })]),
    );
    expect(s.usadas).toBe(1);
  });

  it("a hold booked BEFORE the renewal stays on the old pack (the accepted cosmetic seam)", () => {
    const nueva = venta({ id: "v2", folio: 1002, created_at: "2026-05-22T02:53:00Z", fecha: "2026-05-22T02:53:00Z" });
    const s = saldoDetalle(8, [nueva, venta()], [], TZ_FORGE, conReservas([reserva({ class_session: SESION_FUTURA })]));
    expect(s.apartadas).toBe(0); // booked 20 May, before the 21 May renewal
  });

  it("an untimed (backdated) mark falls back to DATE granularity and ties to the NEWER venta", () => {
    const nueva = venta({ id: "v2", folio: 1002, created_at: "2026-05-22T02:53:00Z", fecha: "2026-05-22T02:53:00Z" });
    const s = saldoDetalle(7, [nueva, venta()], [marca({ fecha: "2026-05-21", hora: null })], TZ_FORGE, SIN_SALDO);
    // 21 May local is the renewal's own day → the newer venta wins, matching the DAL's
    // `hora.is.null` arm, which counts an untimed same-day mark in.
    expect(s.usadas).toBe(1);
  });

  it("an ilimitado anchor derives nothing (no grant to subtract from)", () => {
    const s = saldoDetalle(null, [venta({ clases: null })], [marca()], TZ_FORGE, SIN_SALDO);
    expect(s.usadas).toBe(1);
    expect(s.derived).toBeNull();
    expect(s.discrepancia).toBeNull();
    expect(s.mostrarDiscrepancia).toBe(false);
  });

  it("no ventas → no anchor, nothing derived", () => {
    const s = saldoDetalle(5, [], [marca()], TZ_FORGE, SIN_SALDO);
    expect(s.anchor).toBeNull();
    expect(s.usadas).toBe(0);
    expect(s.derived).toBeNull();
  });

  it("the DAL's out-of-window count REPLACES the asistencia leg, and the reservation leg still adds", () => {
    // Old-anchor path: the fetched 30-day rows can't reach the anchor, so the head-count wins.
    const s = saldoDetalle(2, [venta()], [], TZ_FORGE, conReservas([reserva()], 5));
    expect(s.usadas).toBe(6);
    expect(s.derived).toBe(2);
  });

  describe("the discrepancy note is epoch-scoped (§D1)", () => {
    const post = (over: Partial<FichaVentaRow> = {}) =>
      venta({ created_at: "2026-08-28T18:00:00Z", fecha: "2026-08-28T18:00:00Z", ...over });

    it("a pre-epoch anchor NEVER flags, however wide the gap — the stacked era is expected", () => {
      const s = saldoDetalle(23, [venta()], [], TZ_FORGE, SIN_SALDO);
      expect(s.discrepancia).toBe(-15);
      expect(s.mostrarDiscrepancia).toBe(false);
    });

    it("a post-epoch anchor with a nonzero gap DOES flag", () => {
      const s = saldoDetalle(3, [post()], [], TZ_FORGE, SIN_SALDO);
      expect(s.discrepancia).toBe(5);
      expect(s.mostrarDiscrepancia).toBe(true);
    });

    it("a post-epoch anchor that reconciles does not flag", () => {
      const s = saldoDetalle(8, [post()], [], TZ_FORGE, SIN_SALDO);
      expect(s.discrepancia).toBe(0);
      expect(s.mostrarDiscrepancia).toBe(false);
    });

    it("RESET_EPOCH is the 2026-08-27 outage-fix go-live, to the minute", () => {
      expect(Date.parse(RESET_EPOCH)).toBe(Date.parse("2026-08-27T15:30:00Z"));
    });
  });
});

describe("shapeFicha historial — §D4 attribution tags + 'No asistió — cargada' rows", () => {
  const clienteRow: FichaClienteRow = {
    id: "c1",
    nombre: "Berenice Ríos",
    tel: "614 218 3401",
    paquete_nombre: "8 clases",
    clases_restantes: 6,
    vence: "2026-06-16",
    auth_user_id: null,
    created_at: "2026-04-10T18:00:00Z",
  };
  const V_VIEJA: FichaVentaRow = {
    id: "v1",
    folio: 1001,
    fecha: "2026-04-21T18:00:00Z",
    created_at: "2026-04-21T18:00:00Z",
    paquete_nombre: "8 clases",
    monto: 800,
    metodo: "efectivo",
    clases: 8,
    vigencia_tipo: "dias",
    vigencia_dias: 30,
  };
  // The renewal, WRITTEN 02:53Z on 22 May = 20:53 local on 21 May (AC1's own timestamps).
  const V_NUEVA: FichaVentaRow = { ...V_VIEJA, id: "v2", folio: 1002, fecha: "2026-05-22T02:53:00Z", created_at: "2026-05-22T02:53:00Z" };
  const VENTAS = [V_NUEVA, V_VIEJA]; // created_at desc, the DAL's order
  const marca = (over: Partial<FichaAsistRow> = {}): FichaAsistRow => ({
    fecha: "2026-05-23",
    hora: "10:00:00",
    consumio: true,
    perdonada: false,
    reservation_id: null,
    class_session_id: null,
    origen: "libre",
    class_session: null,
    ...over,
  });
  const reserva = (over: Partial<FichaReservaRow> = {}): FichaReservaRow => ({
    id: "r1",
    created_at: "2026-05-23T18:00:00Z", // held after the renewal
    consumio: true,
    status: "reservada",
    class_session_id: "s1",
    class_session: {
      starts_at: "2026-05-25T13:00:00Z", // lun 25, 07:00 local — over long before AHORA
      duration_min: 60,
      is_special: false,
      special_name: null,
      class_type: { name: "METCON" },
    },
    ...over,
  });

  // AC1: the Vie-21 18:12 mark predates the 20:53 renewal, so it was spent from the OLD pack —
  // and the ficha now SAYS so instead of leaving the operator to reconcile "1 used" by hand.
  it("tags a mark made hours before the renewal as `(paquete anterior)`, and leaves later ones untagged", () => {
    const f = shapeFicha(
      clienteRow,
      [marca(), marca({ fecha: "2026-05-21", hora: "18:12:00" })],
      VENTAS,
      CTX,
      TZ_FORGE,
      [],
      "FORGE",
      SIN_SALDO,
    );
    expect(f.historial.map((h) => [h.dDisplay, h.paqueteAnterior])).toEqual([
      ["sáb 23", false],
      ["jue 21", true],
    ]);
    expect(f.clasesGauge!.usadas).toBe(1); // only the post-renewal mark charges this pack
    expect(f.clasesGauge!.total).toBe(8);
  });

  it("a perdonada row charges nothing, so it is never tagged", () => {
    const f = shapeFicha(
      clienteRow,
      [marca({ fecha: "2026-05-21", hora: "18:12:00", perdonada: true })],
      VENTAS,
      CTX,
      TZ_FORGE,
      [],
      "FORGE",
      SIN_SALDO,
    );
    expect(f.historial[0].paqueteAnterior).toBe(false);
    expect(f.clasesGauge!.usadas).toBe(0);
  });

  // A booking-charged check-in is tagged by the BOOKING's instant, not the mark's: the class was
  // debited when it was held, so a hold placed under the old pack reads as the old pack.
  it("a booking-charged check-in is tagged by when it was BOOKED, not when it was marked", () => {
    const f = shapeFicha(
      clienteRow,
      [marca({ fecha: "2026-05-25", hora: "07:02:00", consumio: false, reservation_id: "r1", class_session_id: "s1" })],
      VENTAS,
      CTX,
      TZ_FORGE,
      [],
      "FORGE",
      conReservas([reserva({ created_at: "2026-05-20T18:00:00Z", status: "asistida" })]),
    );
    expect(f.historial[0].paqueteAnterior).toBe(true); // held 20 May, before the 21 May renewal
    expect(f.clasesGauge!.usadas).toBe(0);
  });

  it("renders a 'No asistió — cargada' row at the CLASS's date/time, in date order with the visits", () => {
    const f = shapeFicha(
      clienteRow,
      [marca({ fecha: "2026-05-26", hora: "09:00:00" })],
      VENTAS,
      CTX,
      TZ_FORGE,
      [],
      "FORGE",
      conReservas([reserva()]),
    );
    expect(f.historial).toHaveLength(2);
    expect(f.historial[0]).toMatchObject({ tipo: "visita", dDisplay: "mar 26" });
    expect(f.historial[1]).toMatchObject({
      tipo: "no_asistio",
      dDisplay: "lun 25",
      hora: "07:00",
      clase: "METCON 07:00",
      origen: "clase",
      paqueteAnterior: false,
    });
    expect(f.saldo.noShows).toBe(1);
    expect(f.clasesGauge!.usadas).toBe(2); // the visit + the charged no-show
  });

  it("a gym-cancelled session shows NOTHING and counts nowhere (AC3)", () => {
    const f = shapeFicha(clienteRow, [], VENTAS, CTX, TZ_FORGE, [], "FORGE", conReservas([reserva({ status: "cancelada" })]));
    expect(f.historial).toHaveLength(0);
    expect(f.saldo.noShows).toBe(0);
    expect(f.clasesGauge!.usadas).toBe(0);
  });

  it("an attended booking shows its VISIT row, never a 'No asistió' line (AC3)", () => {
    const f = shapeFicha(
      clienteRow,
      [marca({ fecha: "2026-05-25", hora: "07:02:00", consumio: false, reservation_id: "r1", class_session_id: "s1" })],
      VENTAS,
      CTX,
      TZ_FORGE,
      [],
      "FORGE",
      conReservas([reserva({ status: "asistida" })]),
    );
    expect(f.historial.map((h) => h.tipo)).toEqual(["visita"]);
    expect(f.saldo.noShows).toBe(0);
  });

  it("a future hold is an APARTADA — no historial row, but it shows in the gauge caption (AC3)", () => {
    const futura = reserva({
      id: "r-fut",
      created_at: "2026-05-26T18:00:00Z",
      class_session: {
        starts_at: "2026-05-28T01:00:00Z", // 2026-05-27 19:00 local, after AHORA
        duration_min: 60,
        is_special: false,
        special_name: null,
        class_type: { name: "METCON" },
      },
    });
    const f = shapeFicha(clienteRow, [], VENTAS, CTX, TZ_FORGE, [], "FORGE", conReservas([futura]));
    expect(f.historial).toHaveLength(0);
    expect(f.clasesGauge!.apartadas).toBe(1);
    expect(f.clasesGauge!.usadas).toBe(0);
  });

  // AC5, the parity that matters most: a same-day renewal is exactly where the two surfaces used
  // to diverge, because one anchored on the sale's DAY and the other on its instant.
  it("AC5: the admin ficha and the client plan card agree on a same-day-renewal member", () => {
    const asistencias = [
      marca({ fecha: "2026-05-24" }),
      marca({ fecha: "2026-05-23" }),
      marca({ fecha: "2026-05-21", hora: "18:12:00" }), // before the 20:53 renewal → old pack
    ];
    const ficha = shapeFicha(clienteRow, asistencias, VENTAS, CTX, TZ_FORGE, [], "FORGE", SIN_SALDO);
    const mem = derivarMembresia(
      {
        paqueteNombre: "8 clases",
        clasesRestantes: 6,
        vence: "2026-06-16",
        anchorMonto: 800,
        anchorVigenciaTipo: "dias",
        anchorVigenciaDias: 30,
        // What the mi_membresia RPC computes in SQL from the SAME §D0 rule.
        cargadas: ficha.saldo.usadas,
        grantClases: ficha.saldo.anchor!.grant,
        apartadas: ficha.saldo.apartadas,
      },
      CTX,
    );
    expect(ficha.clasesGauge!.usadas).toBe(2);
    expect(mem.gauge!.usadas).toBe(ficha.clasesGauge!.usadas);
    expect(mem.gauge!.total).toBe(ficha.clasesGauge!.total);
    expect(mem.gauge!.apartadas).toBe(ficha.clasesGauge!.apartadas);
    expect(mem.gauge!.fill).toBeCloseTo(ficha.clasesGauge!.fill);
    expect(mem.clasesRestLabel).toBe(ficha.cliente.clasesRestLabel);
  });
});

describe("ventaAtribuida + momentoEnZona (§D0 primitives)", () => {
  const anclas = [
    { id: "v2", dia: "2026-05-21", hora: "20:53:00" },
    { id: "v1", dia: "2026-05-01", hora: "12:00:00" },
  ];

  it("picks the latest venta at or before the charge moment", () => {
    expect(ventaAtribuida(anclas, { dia: "2026-05-22", hora: "07:00:00" })).toBe("v2");
    expect(ventaAtribuida(anclas, { dia: "2026-05-21", hora: "20:53:00" })).toBe("v2"); // the boundary is inclusive
    expect(ventaAtribuida(anclas, { dia: "2026-05-21", hora: "20:52:59" })).toBe("v1");
    expect(ventaAtribuida(anclas, { dia: "2026-04-30", hora: "09:00:00" })).toBeNull();
  });

  it("an untimed event compares by DAY only, and its ties go to the newer venta", () => {
    expect(ventaAtribuida(anclas, { dia: "2026-05-21", hora: null })).toBe("v2");
    expect(ventaAtribuida(anclas, { dia: "2026-05-20", hora: null })).toBe("v1");
  });

  it("momentoEnZona resolves in the GYM's zone, seconds included", () => {
    // 02:53Z on 22 May is 20:53 on 21 May in Chihuahua (UTC−6) — the off-by-one a naive
    // ::date would introduce for anything written after 18:00 local.
    expect(momentoEnZona("2026-05-22T02:53:07Z", TZ_FORGE)).toEqual({ dia: "2026-05-21", hora: "20:53:07" });
  });
});

describe("derivarMembresia", () => {
  const clienteRow: FichaClienteRow = {
    id: "c1",
    nombre: "Andrea Castro",
    tel: "614 218 3401",
    paquete_nombre: "8 clases",
    clases_restantes: 5,
    vence: "2026-06-16",
    auth_user_id: null,
    created_at: "2026-04-10T18:00:00Z",
  };
  const venta = (over: Partial<FichaVentaRow> = {}): FichaVentaRow => ({
    id: "v1",
    folio: 1001,
    fecha: "2026-05-17T18:00:00Z",
    created_at: "2026-05-17T18:00:00Z",
    paquete_nombre: "8 clases",
    monto: 800,
    metodo: "efectivo",
    clases: 8,
    vigencia_tipo: "dias",
    vigencia_dias: 30,
    ...over,
  });
  /** The mi_membresia scalars. The three §D3 additions carry the SQL side of §D0 — the same
   *  numbers `saldoDetalle` derives from rows on the admin side. */
  const mFacts = (over: Partial<MembresiaFacts> = {}): MembresiaFacts => ({
    paqueteNombre: "8 clases",
    clasesRestantes: 5,
    vence: "2026-06-16",
    anchorMonto: 800,
    anchorVigenciaTipo: "dias",
    anchorVigenciaDias: 30,
    cargadas: 0,
    grantClases: 8,
    apartadas: 0,
    ...over,
  });
  /** N marks after the 2026-05-17 12:00-Chihuahua venta, one per day back from 05-26. */
  const marcas = (n: number): FichaAsistRow[] =>
    Array.from({ length: n }, (_, i) => ({
      fecha: `2026-05-${String(26 - i).padStart(2, "0")}`,
      hora: "18:00:00",
      consumio: true,
      perdonada: false,
      reservation_id: null,
      class_session_id: null,
      origen: "libre" as const,
      class_session: null,
    }));

  // The load-bearing proof: fed the SAME facts, derivarMembresia's gauge equals shapeFicha's
  // clasesGauge — the client plan card and the admin ficha are ONE derivation.
  it("gauge equals shapeFicha.clasesGauge for the same client (partially drained)", () => {
    const row = { ...clienteRow, clases_restantes: 3 };
    const ficha = shapeFicha(row, marcas(5), [venta()], CTX, TZ_FORGE, [], "FORGE");
    const mem = derivarMembresia(mFacts({ clasesRestantes: 3, cargadas: 5 }), CTX);
    expect(mem.gauge).not.toBeNull();
    expect(mem.gauge!.fill).toBeCloseTo(ficha.clasesGauge!.fill);
    expect(mem.gauge!.usadas).toBe(ficha.clasesGauge!.usadas);
    expect(mem.gauge!.total).toBe(ficha.clasesGauge!.total);
    expect(mem.gauge!.fill).toBeCloseTo(3 / 8);
    expect(mem.gauge!.total).toBe(8);
    expect(mem.gauge!.restantes).toBe(3);
  });

  it("stacked balance clamps to the GRANT on both surfaces (§D2), not to restantes + usadas", () => {
    const row = { ...clienteRow, clases_restantes: 23 };
    const ficha = shapeFicha(row, marcas(1), [venta()], CTX, TZ_FORGE, [], "FORGE");
    const mem = derivarMembresia(mFacts({ clasesRestantes: 23, cargadas: 1 }), CTX);
    expect(mem.gauge!.fill).toBeCloseTo(ficha.clasesGauge!.fill);
    expect(mem.gauge!.total).toBe(ficha.clasesGauge!.total);
    expect(mem.gauge!.fill).toBe(1);
    expect(mem.gauge!.total).toBe(8);
  });

  it("carries apartadas through to the card's caption", () => {
    const mem = derivarMembresia(mFacts({ clasesRestantes: 2, cargadas: 5, apartadas: 1 }), CTX);
    expect(mem.gauge!.usadas).toBe(5);
    expect(mem.gauge!.apartadas).toBe(1);
  });

  it("ilimitado ANCHOR (grant null) hides the bar even with a finite balance (§D1)", () => {
    const mem = derivarMembresia(mFacts({ clasesRestantes: 4, grantClases: null }), CTX);
    expect(mem.gauge).toBeNull();
    expect(mem.clasesRestLabel).toBe("4");
  });

  it("expired/forfeited finite plan → clasesRest 0, empty bar (matches read-time forfeit)", () => {
    // vence in the past → forfeit to 0, exactly as derivarCliente/shapeFicha.
    const mem = derivarMembresia(mFacts({ clasesRestantes: 5, vence: "2026-05-20", cargadas: 8 }), CTX);
    expect(mem.clasesRestLabel).toBe("0");
    expect(mem.vencido).toBe(true);
    expect(mem.gauge!.fill).toBe(0);
    expect(mem.gauge!.usadas).toBe(8);
  });

  it("ilimitado (clases_restantes NULL) → ∞, gauge hidden, cadence 'al mes'", () => {
    const mem = derivarMembresia(
      mFacts({ clasesRestantes: null, anchorVigenciaTipo: "mes", anchorVigenciaDias: null }),
      CTX,
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
      CTX, // HOY = 27 May 2026, so vence 20 May is past
    );
    expect(mem.ilimitado).toBe(true); // forfeit leaves ∞ untouched…
    expect(mem.clasesRestLabel).toBe("∞");
    expect(mem.vencido).toBe(true); // …but the date signal fires independently (the bug)
  });

  it("vence-day itself is NOT vencido (dias === 0 is a valid training day, ruling C9)", () => {
    const mem = derivarMembresia(mFacts({ vence: HOY_DIA }), CTX); // vence === HOY
    expect(mem.vencido).toBe(false);
  });

  it("no anchor sale → no bar, no price, no cadence (still shows plan + renovación)", () => {
    const mem = derivarMembresia(
      mFacts({ anchorMonto: null, anchorVigenciaTipo: null, anchorVigenciaDias: null }),
      CTX,
    );
    expect(mem.gauge).toBeNull();
    expect(mem.precioDisplay).toBeNull();
    expect(mem.cadenciaLabel).toBeNull();
    expect(mem.planNombre).toBe("8 clases");
    expect(mem.renovacionDisplay).toBe("16 jun");
  });

  it("finite cadence renders the días window; price is the anchor monto", () => {
    const mem = derivarMembresia(mFacts({ anchorMonto: 800, anchorVigenciaTipo: "dias", anchorVigenciaDias: 20 }), CTX);
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

describe("esPrimeraCompra — never-had-a-sale predicate (#77)", () => {
  it("is true only at zero ventas (boundary)", () => {
    expect(esPrimeraCompra(0)).toBe(true);
    expect(esPrimeraCompra(1)).toBe(false);
    expect(esPrimeraCompra(2)).toBe(false);
  });
});
