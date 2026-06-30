// Thin ExcelJS assembly for the respaldo export (ADR-0006, build-spec §6).
// Turns the already-shaped RespaldoRows (from the pure rows.ts) into an .xlsx
// Buffer. INTENTIONALLY DUMB: no formatting/derivation logic lives here — only
// sheet assembly, the bold header row, the peso number format on the `money`
// columns, a frozen header, and light column widths. If you find yourself adding
// data logic, it belongs in rows.ts instead.
//
// BOUNDARY: this is the ONLY file in the repo that imports `exceljs`. The
// dependency-cruiser rule keeps ExcelJS out of src/domain; keep it that way.

import ExcelJS from "exceljs";

import type { RespaldoRows, RespaldoSheet } from "./rows";

const MONEY_FMT = "$#,##0.00";

// Light-touch column width: roomy enough for the header label without any real
// autosizing pass over the data (build-spec: do NOT over-engineer this).
const MIN_WIDTH = 12;
const PER_CHAR = 1.1;
const headerWidth = (header: string) => Math.max(MIN_WIDTH, Math.round(header.length * PER_CHAR));

/**
 * Assemble the four respaldo worksheets into a single .xlsx workbook and return
 * it as a Node Buffer (for the route handler's Response body).
 */
export async function buildRespaldoWorkbook(rows: RespaldoRows): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  // Sheet order matches the tab order in the spec (§0): Clientes, Ventas,
  // Asistencias, Paquetes.
  for (const sheet of [rows.clientes, rows.ventas, rows.asistencias, rows.paquetes]) {
    addSheet(wb, sheet);
  }
  // ExcelJS's writeBuffer() is typed as Promise<ExcelJS.Buffer>, an ambient
  // interface that extends ArrayBuffer (see node_modules/exceljs/index.d.ts).
  // Wrap it into a Node Buffer for the Response body. Buffer.from accepts an
  // ArrayBuffer, so the cast is sound and no `any` is needed.
  const out = await wb.xlsx.writeBuffer();
  return Buffer.from(out as ArrayBuffer);
}

function addSheet(wb: ExcelJS.Workbook, sheet: RespaldoSheet): void {
  const ws = wb.addWorksheet(sheet.name);

  const header = ws.addRow(sheet.headers);
  header.font = { bold: true };

  for (const row of sheet.rows) {
    ws.addRow(row);
  }

  // Peso number format on the money columns (0-based in RespaldoSheet; ExcelJS
  // columns are 1-based). The value stays numeric (set in rows.ts) — only the
  // display format changes, so totals/sorts still work in Excel (PRD US#7).
  for (const col of sheet.money ?? []) {
    ws.getColumn(col + 1).numFmt = MONEY_FMT;
  }

  // Light-touch widths off the header label only (no data scan).
  sheet.headers.forEach((label, i) => {
    ws.getColumn(i + 1).width = headerWidth(label);
  });

  // Freeze the header row so it stays visible while scrolling the ledger.
  ws.views = [{ state: "frozen", ySplit: 1 }];
}
