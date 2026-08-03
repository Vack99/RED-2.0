import { notFound } from "next/navigation";
import { makeRoster } from "../_fixtures";
import { ProtoShell } from "../_components/shell";
import { InicioC } from "./_components/inicio-c";

// apps/admin/src/app/proto/c-inicio/page.tsx — VARIANT C, screen 1 of 2
// (localhost-only, hard rule 2).
//
// Option C: the DASHBOARD owns the work queue and CLIENTES becomes a pure
// directory (/proto/c-inicio/directorio). This is the literal shape #181 found
// in the market — "attendance-recency is real, near-universal, and lives in a
// REPORT — not in the directory… ZERO vendors make attendance recency a rank or
// a tier inside the member list" (C3), and "nobody found puts expired members at
// the top of the default list" (C6).
//
// This page is a mock of the REAL apps/admin/src/app/(app)/inicio screen —
// same brand row, greeting, hero card + sparkline, stat pair, PASE DE LISTA CTA,
// quick actions and ÚLTIMAS ASISTENCIAS tail — with one block inserted:
// NECESITAN ATENCIÓN. Everything else is scenery ON PURPOSE: the question this
// variant has to answer is whether the queue survives contact with a dashboard
// that already has a job, not whether a queue looks good on a blank page.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ n?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const sp = await searchParams;
  const n = Number(sp.n) || 30;
  return (
    <ProtoShell>
      <InicioC clientes={makeRoster(n)} n={n} />
    </ProtoShell>
  );
}
