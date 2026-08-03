import { notFound } from "next/navigation";
import { makeRoster } from "../../_fixtures";
import { ProtoShell } from "../../_components/shell";
import { InicioE } from "../_components/inicio-e";

// apps/admin/src/app/proto/e-ventana/inicio/page.tsx — VARIANT E, screen 2 of 2
// (localhost-only, hard rule 2).
//
// Fitco's two bounded tiles — `Próximas Renovaciones` and `Clientes por
// Recuperar` — placed low on a mirror of the real INICIO, where ÚLTIMAS
// ASISTENCIAS sits today. The tile is the entry point; /proto/e-ventana is the
// destination, and both tiles deep-link into it pre-filtered.
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
      <InicioE clientes={makeRoster(n)} n={n} />
    </ProtoShell>
  );
}
