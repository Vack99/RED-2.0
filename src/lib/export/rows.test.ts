import { describe, expect, it } from "vitest";

import {
  buildRespaldoRows,
  type RespaldoAsistencia,
  type RespaldoCliente,
  type RespaldoData,
  type RespaldoPaquete,
  type RespaldoVenta,
} from "./rows";

// House fixture style (build-spec §9): inline factory fns with spread overrides,
// a FIXED Chihuahua "today" so derivarCliente / urgenciaCliente are deterministic.
const HOY = new Date(2026, 4, 27); // 27 may 2026 (local-field Chihuahua date)

const cliente = (over: Partial<RespaldoCliente> = {}): RespaldoCliente => ({
  id: "c1",
  nombre: "Andrea Castro",
  tel: "614 218 3401",
  paquete_nombre: "8 clases",
  clases_restantes: 8,
  vence: "2026-07-01", // dias 35 from HOY
  email: "andrea@example.com",
  birthday: "1994-06-16",
  alta: "2026-01-15T18:30:00.000Z",
  ...over,
});

const venta = (over: Partial<RespaldoVenta> = {}): RespaldoVenta => ({
  folio: 1001,
  fecha: "2026-05-20T15:00:00.000Z",
  cliente_id: "c1",
  paquete_nombre: "8 clases",
  monto: 1250.5,
  metodo: "efectivo",
  vigencia_tipo: "dias",
  vigencia_dias: 30,
  ...over,
});

const asistencia = (over: Partial<RespaldoAsistencia> = {}): RespaldoAsistencia => ({
  fecha: "2026-05-26",
  hora: "08:45:00",
  cliente_id: "c1",
  ...over,
});

const paquete = (over: Partial<RespaldoPaquete> = {}): RespaldoPaquete => ({
  nombre: "8 clases",
  precio: 800,
  clases: 8,
  vigencia_tipo: "dias",
  vigencia_dias: 30,
  ...over,
});

const data = (over: Partial<RespaldoData> = {}): RespaldoData => ({
  generadoHoy: HOY,
  clientes: [],
  ventas: [],
  asistencias: [],
  paquetes: [],
  ...over,
});

describe("buildRespaldoRows — headers", () => {
  it("emits the four sheets with their tab names in order", () => {
    const r = buildRespaldoRows(data());
    expect(r.clientes.name).toBe("Clientes");
    expect(r.ventas.name).toBe("Ventas");
    expect(r.asistencias.name).toBe("Asistencias");
    expect(r.paquetes.name).toBe("Paquetes");
  });

  it("uses the exact Spanish headers per sheet", () => {
    const r = buildRespaldoRows(data());
    expect(r.clientes.headers).toEqual([
      "Nombre",
      "Teléfono",
      "Email",
      "Cumpleaños",
      "Paquete",
      "Clases restantes",
      "Vence",
      "Estado",
      "Urgencia",
      "Alta",
    ]);
    expect(r.ventas.headers).toEqual([
      "Folio",
      "Fecha",
      "Cliente",
      "Paquete",
      "Monto",
      "Método",
      "Vigencia",
    ]);
    expect(r.asistencias.headers).toEqual(["Fecha", "Hora", "Cliente"]);
    expect(r.paquetes.headers).toEqual(["Paquete", "Clases", "Precio", "Vigencia"]);
  });
});

describe("buildRespaldoRows — money columns are raw NUMBERS + money indices", () => {
  it("emits Monto as a raw number (summable in Excel), with money=[4]", () => {
    const r = buildRespaldoRows(data({ ventas: [venta({ monto: 1250.5 })] }));
    const row = r.ventas.rows[0];
    expect(row[4]).toBe(1250.5);
    expect(typeof row[4]).toBe("number");
    expect(r.ventas.money).toEqual([4]);
  });

  it("emits Precio as a raw number, with money=[2]", () => {
    const r = buildRespaldoRows(data({ paquetes: [paquete({ precio: 800 })] }));
    const row = r.paquetes.rows[0];
    expect(row[2]).toBe(800);
    expect(typeof row[2]).toBe("number");
    expect(r.paquetes.money).toEqual([2]);
  });

  it("leaves Folio as a plain (non-money) number", () => {
    const r = buildRespaldoRows(data({ ventas: [venta({ folio: 1001 })] }));
    expect(r.ventas.rows[0][0]).toBe(1001);
    // money is only the Monto column.
    expect(r.ventas.money).toEqual([4]);
  });

  it("sets no money array on Clientes / Asistencias", () => {
    const r = buildRespaldoRows(
      data({ clientes: [cliente()], asistencias: [asistencia()] }),
    );
    expect(r.clientes.money).toBeUndefined();
    expect(r.asistencias.money).toBeUndefined();
  });
});

describe("buildRespaldoRows — estado labels (reused derivation)", () => {
  it('"Activo" for a healthy package', () => {
    const r = buildRespaldoRows(
      data({ clientes: [cliente({ vence: "2026-07-01", clases_restantes: 10 })] }),
    );
    expect(r.clientes.rows[0][7]).toBe("Activo");
  });

  it('"Por vencer" when few days remain', () => {
    const r = buildRespaldoRows(
      data({ clientes: [cliente({ vence: "2026-05-31", clases_restantes: 8 })] }),
    );
    expect(r.clientes.rows[0][7]).toBe("Por vencer");
  });

  it('"Sin clases" when the package is expired', () => {
    const r = buildRespaldoRows(
      data({ clientes: [cliente({ vence: "2026-05-20", clases_restantes: 5 })] }),
    );
    expect(r.clientes.rows[0][7]).toBe("Sin clases");
  });
});

describe("buildRespaldoRows — urgencia labels (reused derivation)", () => {
  it('"Crítico" when the package is expired (días <= 3)', () => {
    const r = buildRespaldoRows(
      data({ clientes: [cliente({ vence: "2026-05-20", clases_restantes: 5 })] }),
    );
    expect(r.clientes.rows[0][8]).toBe("Crítico");
  });

  it('"Urgente" when 4 days remain', () => {
    const r = buildRespaldoRows(
      data({ clientes: [cliente({ vence: "2026-05-31", clases_restantes: 8 })] }),
    );
    expect(r.clientes.rows[0][8]).toBe("Urgente");
  });

  it('"Pronto" when ~12 days remain', () => {
    const r = buildRespaldoRows(
      data({ clientes: [cliente({ vence: "2026-06-08", clases_restantes: 10 })] }),
    );
    expect(r.clientes.rows[0][8]).toBe("Pronto");
  });

  it('"OK" for a healthy package', () => {
    const r = buildRespaldoRows(
      data({ clientes: [cliente({ vence: "2026-07-01", clases_restantes: 10 })] }),
    );
    expect(r.clientes.rows[0][8]).toBe("OK");
  });
});

describe("buildRespaldoRows — clases-restantes label", () => {
  it('"Ilimitado" when clases_restantes is null', () => {
    const r = buildRespaldoRows(
      data({ clientes: [cliente({ clases_restantes: null })] }),
    );
    expect(r.clientes.rows[0][5]).toBe("Ilimitado");
  });

  it('plural "N clases" for a finite count', () => {
    const r = buildRespaldoRows(
      data({ clientes: [cliente({ clases_restantes: 8 })] }),
    );
    expect(r.clientes.rows[0][5]).toBe("8 clases");
  });

  it('singular "1 clase"', () => {
    const r = buildRespaldoRows(
      // vence far out so forfeit does not zero the count.
      data({ clientes: [cliente({ clases_restantes: 1, vence: "2026-07-01" })] }),
    );
    expect(r.clientes.rows[0][5]).toBe("1 clase");
  });
});

describe("buildRespaldoRows — date formatting (ISO ledger vs day-month near-future)", () => {
  it("Clientes Alta is ISO year-complete (from the timestamptz created_at)", () => {
    const r = buildRespaldoRows(
      data({ clientes: [cliente({ alta: "2026-01-15T18:30:00.000Z" })] }),
    );
    expect(r.clientes.rows[0][9]).toBe("2026-01-15");
  });

  it("Clientes Cumpleaños is day-month", () => {
    const r = buildRespaldoRows(
      data({ clientes: [cliente({ birthday: "1994-06-16" })] }),
    );
    expect(r.clientes.rows[0][3]).toBe("16 jun");
  });

  it('Clientes Cumpleaños falls back to "—" when null', () => {
    const r = buildRespaldoRows(
      data({ clientes: [cliente({ birthday: null })] }),
    );
    expect(r.clientes.rows[0][3]).toBe("—");
  });

  it("Clientes Vence is the reused day-month venceDisplay", () => {
    const r = buildRespaldoRows(
      data({ clientes: [cliente({ vence: "2026-07-01" })] }),
    );
    expect(r.clientes.rows[0][6]).toBe("1 jul");
  });

  it("Ventas Fecha is ISO (from the timestamptz fecha, Chihuahua-local)", () => {
    const r = buildRespaldoRows(
      data({ ventas: [venta({ fecha: "2026-05-20T15:00:00.000Z" })] }),
    );
    expect(r.ventas.rows[0][1]).toBe("2026-05-20");
  });

  it("Asistencias Fecha is ISO and Hora is HH:MM", () => {
    const r = buildRespaldoRows(
      data({ asistencias: [asistencia({ fecha: "2026-05-26", hora: "08:45:00" })] }),
    );
    expect(r.asistencias.rows[0][0]).toBe("2026-05-26");
    expect(r.asistencias.rows[0][1]).toBe("08:45");
  });

  it('Asistencias Hora falls back to "—" when null (back-entered)', () => {
    const r = buildRespaldoRows(
      data({ asistencias: [asistencia({ hora: null })] }),
    );
    expect(r.asistencias.rows[0][1]).toBe("—");
  });
});

describe("buildRespaldoRows — denormalized client name", () => {
  it("resolves cliente_id → nombre on Ventas + Asistencias via the roster map", () => {
    const r = buildRespaldoRows(
      data({
        clientes: [cliente({ id: "c1", nombre: "Andrea Castro" })],
        ventas: [venta({ cliente_id: "c1" })],
        asistencias: [asistencia({ cliente_id: "c1" })],
      }),
    );
    expect(r.ventas.rows[0][2]).toBe("Andrea Castro");
    expect(r.asistencias.rows[0][2]).toBe("Andrea Castro");
  });

  it('falls back to "—" for an unknown cliente_id (hard-deleted client)', () => {
    const r = buildRespaldoRows(
      data({
        clientes: [cliente({ id: "c1" })],
        ventas: [venta({ cliente_id: "ghost" })],
        asistencias: [asistencia({ cliente_id: "ghost" })],
      }),
    );
    expect(r.ventas.rows[0][2]).toBe("—");
    expect(r.asistencias.rows[0][2]).toBe("—");
  });
});

describe("buildRespaldoRows — Email fallback + Vigencia + metodo labels", () => {
  it('Email falls back to "—" when null', () => {
    const r = buildRespaldoRows(data({ clientes: [cliente({ email: null })] }));
    expect(r.clientes.rows[0][2]).toBe("—");
  });

  it('Vigencia reads "todo el mes" for a mes package, "N días" otherwise', () => {
    const r = buildRespaldoRows(
      data({
        ventas: [
          venta({ vigencia_tipo: "mes", vigencia_dias: null }),
          venta({ vigencia_tipo: "dias", vigencia_dias: 30 }),
        ],
        paquetes: [
          paquete({ vigencia_tipo: "mes", vigencia_dias: null }),
          paquete({ vigencia_tipo: "dias", vigencia_dias: 15 }),
        ],
      }),
    );
    expect(r.ventas.rows[0][6]).toBe("todo el mes");
    expect(r.ventas.rows[1][6]).toBe("30 días");
    expect(r.paquetes.rows[0][3]).toBe("todo el mes");
    expect(r.paquetes.rows[1][3]).toBe("15 días");
  });

  it("maps metodo to its Spanish label, passing through unknown values", () => {
    const r = buildRespaldoRows(
      data({
        ventas: [
          venta({ metodo: "efectivo" }),
          venta({ metodo: "transferencia" }),
          venta({ metodo: "tarjeta" }),
          venta({ metodo: "pendiente" }),
          venta({ metodo: "raro" }),
        ],
      }),
    );
    expect(r.ventas.rows[0][5]).toBe("Efectivo");
    expect(r.ventas.rows[1][5]).toBe("Transferencia");
    expect(r.ventas.rows[2][5]).toBe("Tarjeta");
    expect(r.ventas.rows[3][5]).toBe("Por pagar");
    expect(r.ventas.rows[4][5]).toBe("raro");
  });
});

describe("buildRespaldoRows — Paquetes clases label", () => {
  it('"Ilimitado" when clases is null', () => {
    const r = buildRespaldoRows(data({ paquetes: [paquete({ clases: null })] }));
    expect(r.paquetes.rows[0][1]).toBe("Ilimitado");
  });

  it('"N clases" / singular "1 clase"', () => {
    const r = buildRespaldoRows(
      data({ paquetes: [paquete({ clases: 8 }), paquete({ clases: 1 })] }),
    );
    expect(r.paquetes.rows[0][1]).toBe("8 clases");
    expect(r.paquetes.rows[1][1]).toBe("1 clase");
  });
});

describe("buildRespaldoRows — full Clientes row (every column)", () => {
  it("shapes a representative client across all 10 columns", () => {
    const r = buildRespaldoRows(
      data({
        clientes: [
          cliente({
            nombre: "Andrea Castro",
            tel: "614 218 3401",
            email: "andrea@example.com",
            birthday: "1994-06-16",
            paquete_nombre: "8 clases",
            clases_restantes: 8,
            vence: "2026-07-01",
            alta: "2026-01-15T18:30:00.000Z",
          }),
        ],
      }),
    );
    expect(r.clientes.rows[0]).toEqual([
      "Andrea Castro",
      "614 218 3401",
      "andrea@example.com",
      "16 jun",
      "8 clases",
      "8 clases",
      "1 jul",
      "Activo",
      "OK",
      "2026-01-15",
    ]);
  });
});

describe("buildRespaldoRows — empty state (PRD US#17)", () => {
  it("every empty input array yields a header-only sheet (no rows, no crash)", () => {
    const r = buildRespaldoRows(data());
    expect(r.clientes.rows).toEqual([]);
    expect(r.ventas.rows).toEqual([]);
    expect(r.asistencias.rows).toEqual([]);
    expect(r.paquetes.rows).toEqual([]);
    // headers still present
    expect(r.clientes.headers.length).toBe(10);
    expect(r.ventas.headers.length).toBe(7);
    expect(r.asistencias.headers.length).toBe(3);
    expect(r.paquetes.headers.length).toBe(4);
  });
});
