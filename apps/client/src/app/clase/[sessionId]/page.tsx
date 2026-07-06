import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";

import { getSaldoMiembro } from "@gym/data/server/agenda-miembro";
import { getClaseDetalleMiembro } from "@gym/data/server/clase-miembro";
import { createClient } from "@gym/data/server/supabase";

import { ClaseDetalle } from "./_components/clase-detalle";

export const metadata: Metadata = {
  title: "Clase",
  description: "Detalle de la clase.",
};

/**
 * Clase detail (PRD #49 S3, slice #59): the full class page — status hero, datos, coaches
 * with bios, la sesión, qué trabajamos, qué traer, and the cupo roster of real attendees —
 * reached from mis reservas. A page-level auth gate (getClaims, never getSession — ADR-0001)
 * redirects a signed-out visitor to /entrar; the detail read is RLS-scoped to the member's
 * own gym, so a session they can't see resolves to notFound(). Paint is token-driven.
 */
export default async function ClasePage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/entrar");

  const [detalle, saldo] = await Promise.all([
    getClaseDetalleMiembro(sessionId),
    getSaldoMiembro(),
  ]);
  if (!detalle) notFound();

  return <ClaseDetalle detalle={detalle} saldo={saldo} />;
}
