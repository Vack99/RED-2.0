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

import { requireOperator } from "@gym/data/server/_auth";
import { getOperatorGym } from "@gym/data/server/gym";
import { getRespaldoData } from "@gym/data/server/respaldo";
import { buildRespaldoSheets } from "@gym/data/server/export/rows";
import { buildRespaldoWorkbook } from "@gym/data/server/export/workbook";
import { createClient } from "@gym/data/server/supabase";

export const runtime = "nodejs"; // ExcelJS needs Node, not edge

const XLSX_CONTENT_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

// Validated BEFORE the value reaches a query or the filename (spec §2.1).
const MES_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

export async function GET(request: Request): Promise<Response> {
  const supabase = await createClient();

  try {
    await requireOperator(supabase);
  } catch {
    return new Response("No autenticado", { status: 401 });
  }

  // The route takes NO gym identifier — the gym is derived from auth.uid() →
  // gym_membership (spec §2.1). A member-only session ("Sin gym asignado") is a
  // clean 403, not a 500.
  let gym;
  try {
    gym = await getOperatorGym(supabase);
  } catch {
    return new Response("Sin acceso", { status: 403 });
  }

  const mesRaw = new URL(request.url).searchParams.get("mes");
  if (mesRaw !== null && !MES_RE.test(mesRaw)) {
    return new Response("Mes inválido", { status: 400 });
  }
  const mes = mesRaw ?? undefined;

  const data = await getRespaldoData(supabase, mes);
  const buffer = await buildRespaldoWorkbook(buildRespaldoSheets(data));

  // Filename from the MEMBERSHIP-RESOLVED slug — never x-gym (the host is
  // attacker-influenceable, ADR-0008, and absent on unmapped hosts) — sanitized
  // AT THE HEADER SINK: gym.slug has no format CHECK in the DB and flows into
  // Content-Disposition (quote/CRLF injection). The header must not depend on a
  // DB constraint that does not exist.
  const slugSafe = gym.slug.toLowerCase().replace(/[^a-z0-9-]/g, "");
  const filename = `${slugSafe}-respaldo-${mes ?? "ultimos-24-meses"}.xlsx`;

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
