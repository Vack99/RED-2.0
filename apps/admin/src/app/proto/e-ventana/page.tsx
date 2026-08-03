import { notFound } from "next/navigation";
import { makeRoster } from "../_fixtures";
import { DirectorioVentana } from "./_components/ventana";

// apps/admin/src/app/proto/e-ventana/page.tsx — VARIANT E, screen 1 of 2
// (localhost-only, hard rule 2).
//
// Option E is a straight implementation of what #181 documents, not a design
// exercise. Two vendors carry it:
//
//   Fitco     — `Estado` is a COLUMN on one list (`Cliente Activo` /
//               `Cliente Inactivo`), derived from membership validity on both
//               axes, with no `dar de baja` verb anywhere; plus the two bounded
//               dashboard tiles on the sibling screen (/proto/e-ventana/inicio).
//   Connect Gym — the header, OBSERVED on their own product screenshot:
//               `Alumnos Activos 47 de 52 totales`. A ratio, not a partition.
//
// `?f=renovar` / `?f=atiempo` is how a dashboard tile hands its set over:
// the tile is the entry point, this list is the destination.
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ n?: string; f?: string }>;
}) {
  if (process.env.NODE_ENV === "production") notFound();

  const sp = await searchParams;
  const n = Number(sp.n) || 30;
  const f = sp.f === "renovar" ? "renovar" : sp.f === "atiempo" ? "aTiempo" : null;
  return <DirectorioVentana clientes={makeRoster(n)} n={n} f0={f} />;
}
