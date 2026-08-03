import { notFound } from "next/navigation";
import { makeRoster } from "../_fixtures";
import { TiersScreen } from "./_components/tiers";

// apps/admin/src/app/proto/a-tiers/page.tsx — THROWAWAY, localhost-only
// (hard rule 2). Option A of map #180: CLIENTES keeps the "who needs action"
// job, and three lifecycle tiers make the first screenful actionable. Reads
// the shared `?n=` scale param (30/200/500) set by /proto's switcher.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ n?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const sp = await searchParams;
  const n = Number(sp.n) || 30;
  return <TiersScreen clientes={makeRoster(n)} />;
}
