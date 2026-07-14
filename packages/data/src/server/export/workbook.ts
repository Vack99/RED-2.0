// Thin ExcelJS assembly for the respaldo export (ADR-0006, build-spec §6).
// Turns the already-shaped RespaldoRows (from the pure rows.ts) into an .xlsx
// Buffer. INTENTIONALLY DUMB: no formatting/derivation logic lives here — only
// sheet assembly, the bold header row, the peso number format on the `money`
// columns, a frozen header, and light column widths. If you find yourself adding
// data logic, it belongs in rows.ts instead.
//
// BOUNDARY: this is the ONLY file in the repo that imports `exceljs`. The
// dependency-cruiser rule keeps ExcelJS out of @gym/domain; keep it that way.

// Node-only (exceljs builds a Buffer) and publicly reachable as
// @gym/data/server/export/workbook — the poison-pill keeps it server-side
// (ADR-0011 §5: every ./server module that isn't a pure carve-out keeps it).
import "server-only";

import ExcelJS from "exceljs";

import type { RespaldoSheet } from "./rows";

const MONEY_FMT = "$#,##0.00";

// Light-touch column width: roomy enough for the header label without any real
// autosizing pass over the data (build-spec: do NOT over-engineer this).
const MIN_WIDTH = 12;
const PER_CHAR = 1.1;
const headerWidth = (header: string) => Math.max(MIN_WIDTH, Math.round(header.length * PER_CHAR));

/**
 * Assemble the shaped worksheets (already in tab order — buildRespaldoSheets
 * decides the list) into a single .xlsx workbook and return it as a Node Buffer
 * (for the route handler's Response body).
 */
export async function buildRespaldoWorkbook(sheets: RespaldoSheet[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  for (const sheet of sheets) {
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

  const bold = new Set(sheet.boldRows ?? []);
  sheet.rows.forEach((row, i) => {
    const added = ws.addRow(row);
    if (bold.has(i)) added.font = { bold: true };
  });

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
