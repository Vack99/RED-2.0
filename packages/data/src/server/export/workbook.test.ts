// Thin integration smoke test for the workbook assembler (build-spec §6). It does
// NOT test ExcelJS internals — it round-trips a small sheet list through
// buildRespaldoWorkbook and reads the buffer back with a fresh workbook to assert
// the structure the operator actually relies on: named sheets in the given order,
// a header row, the data rows, the peso number format on the money columns (with
// the cell VALUE still numeric), boldRows applied, and a non-empty Node Buffer.

import ExcelJS from "exceljs";
import { describe, expect, it } from "vitest";

import { buildRespaldoWorkbook } from "./workbook";
import type { RespaldoRows } from "./rows";

// A small hand-built RespaldoRows (already in the shape rows.ts emits): money
// columns flagged 0-based — Ventas Monto = col 4, Paquetes Precio = col 2.
const rows: RespaldoRows = {
  clientes: {
    name: "Clientes",
    headers: ["Nombre", "Teléfono", "Email"],
    rows: [["Andrea Castro", "614 218 3401", "andrea@example.com"]],
  },
  ventas: {
    name: "Ventas",
    headers: ["Folio", "Fecha", "Cliente", "Paquete", "Monto", "Método", "Vigencia"],
    rows: [
      [1001, "2026-05-20", "Andrea Castro", "8 clases", 1250.5, "Efectivo", "30 días"],
      [1002, "2026-05-21", "Beto Ruiz", "Mensual", 800, "Transferencia", "30 días"],
    ],
    money: [4],
  },
  asistencias: {
    name: "Asistencias",
    headers: ["Fecha", "Hora", "Cliente"],
    rows: [["2026-05-26", "08:45", "Andrea Castro"]],
  },
  paquetes: {
    name: "Paquetes",
    headers: ["Paquete", "Clases", "Precio", "Vigencia"],
    rows: [["8 clases", "8 clases", 800, "30 días"]],
    money: [2],
  },
};

describe("buildRespaldoWorkbook", () => {
  it("round-trips to a readable workbook with the right structure + money format", async () => {
    const buffer = await buildRespaldoWorkbook([
      rows.clientes,
      rows.ventas,
      rows.asistencias,
      rows.paquetes,
    ]);

    // Returns a non-empty Node Buffer.
    expect(Buffer.isBuffer(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(0);

    // ExcelJS's load() is typed for its ambient `Buffer extends ArrayBuffer`
    // (see node_modules/exceljs/index.d.ts), which a Node Buffer doesn't
    // structurally satisfy — but load() reads a Node Buffer fine at runtime.
    // Cast to the parameter ExcelJS declares (not `any`) at the seam.
    type LoadArg = Parameters<ExcelJS.Xlsx["load"]>[0];
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as LoadArg);

    // Four worksheets, exact names, in order.
    expect(wb.worksheets.map((ws) => ws.name)).toEqual([
      "Clientes",
      "Ventas",
      "Asistencias",
      "Paquetes",
    ]);

    // Header row text matches the input headers (Ventas).
    const ventas = wb.getWorksheet("Ventas")!;
    const headerCells = (ventas.getRow(1).values as unknown[]).slice(1); // [1] = 1-based pad
    expect(headerCells).toEqual(rows.ventas.headers);

    // Row count = headers (1) + data rows.
    expect(ventas.rowCount).toBe(1 + rows.ventas.rows.length);

    // Money column carries the peso format AND the cell value is a number.
    const montoCell = ventas.getCell(2, 5); // first data row, Monto col (1-based)
    expect(montoCell.numFmt).toBe("$#,##0.00");
    expect(typeof montoCell.value).toBe("number");
    expect(montoCell.value).toBe(1250.5);

    // Same guard on Paquetes Precio (col index 2 → 1-based col 3).
    const paquetes = wb.getWorksheet("Paquetes")!;
    const precioCell = paquetes.getCell(2, 3);
    expect(precioCell.numFmt).toBe("$#,##0.00");
    expect(typeof precioCell.value).toBe("number");
    expect(precioCell.value).toBe(800);
  });

  it("bolds exactly the rows a sheet flags in boldRows (the Ventas TOTAL row pattern)", async () => {
    const buffer = await buildRespaldoWorkbook([
      {
        name: "Ventas",
        headers: ["Folio", "Monto"],
        rows: [[1, 100], [], ["TOTAL", 100]],
        money: [1],
        boldRows: [2],
      },
    ]);
    type LoadArg = Parameters<ExcelJS.Xlsx["load"]>[0];
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as unknown as LoadArg);
    const ws = wb.getWorksheet("Ventas")!;
    // Row 1 = headers (bold), rows 2-4 = data; only row 4 (boldRows index 2) bold.
    expect(ws.getRow(2).font?.bold ?? false).toBe(false);
    expect(ws.getRow(4).font?.bold).toBe(true);
  });
});
