import { notFound } from "next/navigation";
import { makeRoster } from "../../_fixtures";
import { ProtoShell } from "../../_components/shell";
import { DirectorioC } from "../_components/directorio";

// apps/admin/src/app/proto/c-inicio/directorio/page.tsx — VARIANT C, screen 2 of
// 2 (localhost-only, hard rule 2).
//
// CLIENTES with the urgency taken OUT: no ranking, no red, no filters, no sort
// control. A→Z, search-first, diacritic-folded, and every row states its own
// state in plain words. The thing this screen exists to answer is whether that
// makes the directory BETTER TO SEARCH or merely EMPTIER.
//
// `?q=` is how INICIO hands a person over: the attention rows deep-link here
// with the name pre-typed.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ n?: string; q?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const sp = await searchParams;
  const n = Number(sp.n) || 30;
  return (
    <ProtoShell>
      <DirectorioC clientes={makeRoster(n)} n={n} q0={sp.q ?? ""} />
    </ProtoShell>
  );
}
