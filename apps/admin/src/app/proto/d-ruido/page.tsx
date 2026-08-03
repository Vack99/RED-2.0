import { notFound } from "next/navigation";
import { makeRoster } from "../_fixtures";
import { RuidoScreen } from "./_components/ruido";

// apps/admin/src/app/proto/d-ruido/page.tsx — OPTION D · RUIDO (hard rule 2:
// this surface is localhost-only). The YAGNI control: build nothing, just stop
// lying. Same `?n=` scale param as every other variant (30/200/500).
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ n?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const sp = await searchParams;
  const n = Number(sp.n) || 30;
  return <RuidoScreen clientes={makeRoster(n)} />;
}
