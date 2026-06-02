// GET Route Handler for the respaldo export (ADR-0006, build-spec §7): the HTTP
// delivery seam that streams the operator's weekly .xlsx backup of the gym record.
// It only wires the already-built, already-tested pieces together —
//   auth (requireOperator) → gather (getRespaldoData) → shape (buildRespaldoRows)
//   → assemble (buildRespaldoWorkbook) → stream
// — so there is no logic to unit-test here; correctness is the wiring + the
// vendored Next route contract.
//
// runtime = "nodejs": ExcelJS needs Node APIs (Buffer/streams), not the edge
// runtime. GET handlers are dynamic by default in this Next, so each request
// produces a fresh current snapshot; "Cache-Control: no-store" makes that explicit.
//
// Auth is defense-in-depth: RLS is the hard boundary (ADR-0001) and proxy.ts
// already gates authed routes. requireOperator (getClaims()-based, never
// getSession()) throws on a missing operator claim; we wrap it so an auth failure
// is a clean 401 ("No autenticado"), not a 500.

import { requireOperator } from "@/lib/data/_auth";
import { getRespaldoData } from "@/lib/data/respaldo";
import { buildRespaldoRows } from "@/lib/export/rows";
import { buildRespaldoWorkbook } from "@/lib/export/workbook";
import { hoyChihuahua, toIsoDay } from "@/lib/fecha";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs"; // ExcelJS needs Node, not edge

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(): Promise<Response> {
  const supabase = await createClient();

  try {
    await requireOperator(supabase);
  } catch {
    return new Response("No autenticado", { status: 401 });
  }

  const data = await getRespaldoData(supabase);
  const buffer = await buildRespaldoWorkbook(buildRespaldoRows(data));
  const filename = `forge-respaldo-${toIsoDay(hoyChihuahua())}.xlsx`;

  // The body is a Node Buffer (Uint8Array under the hood), a valid BodyInit; the
  // cast just satisfies TS's lib.dom BodyInit union, which omits Node's Buffer.
  return new Response(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
