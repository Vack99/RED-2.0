import { notFound } from "next/navigation";

import { makeRoster } from "../_fixtures";
import { ProtoShell } from "../_components/shell";
import { DeskScreen } from "./_components/desk";

// apps/admin/src/app/proto/b-desk/page.tsx — THROWAWAY, localhost-only (hard
// rule 2). Variant B for map #180: put the lifecycle signal where the operator
// ALREADY is (the desk, 7.9 asistencias per venta — #185) instead of where the
// directory hopes they will look. Reads the shared `?n=` scale param.
//
// No `title` is passed to ProtoShell: DeskScreen renders its own AppBar so the
// label follows the PUERTA/DIRECTORIO switch (the shell's documented opt-out).
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
      <DeskScreen clientes={makeRoster(n)} escala={n} />
    </ProtoShell>
  );
}
