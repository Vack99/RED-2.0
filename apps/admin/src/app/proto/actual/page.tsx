import { notFound } from "next/navigation";
import { makeRoster } from "../_fixtures";
import { ActualScreen } from "./_components/actual";

// apps/admin/src/app/proto/actual/page.tsx — THE BASELINE (hard rule 2: this
// surface is localhost-only). Reads the shared `?n=` scale param (30/200/500,
// set by /proto's switcher) and renders ActualScreen — today's real page,
// unchanged — against that many fixture rows.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ n?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const sp = await searchParams;
  const n = Number(sp.n) || 30;
  return <ActualScreen clientes={makeRoster(n)} />;
}
