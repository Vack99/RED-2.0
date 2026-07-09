import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getConfirmacionReserva } from "@gym/data/server/clase-miembro";
import { createClient } from "@gym/data/server/supabase";

import { ConfirmadaVista } from "./_components/confirmada-vista";

export const metadata: Metadata = {
  title: "Reserva confirmada",
  description: "Tu lugar está apartado.",
};

/**
 * Confirmada (PRD #49 S3, slice #59): the standalone booking-success page — ticket card +
 * arrival reminders — reached after booking from the class-detail page. Auth-gated
 * (getClaims — ADR-0001). ALWAYS fed by a REAL active booking: getConfirmacionReserva
 * returns null unless the member holds a `reservada` reservation for this not-yet-started
 * session, so a stale or invalid link redirects to /reservar rather than paint the mock's
 * hardcoded fallback ticket. Paint is token-driven.
 */
export default async function ConfirmadaPage({
  params,
}: {
  params: Promise<{ sessionId: string }>;
}) {
  const { sessionId } = await params;

  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/entrar");

  // Host reconciliation (audit #17 / spec §5.5): the presentation tenant (x-gym) picks the
  // caller's membership in THIS gym when they belong to several. Presentation-only — RLS scopes the read.
  const hostGym = (await headers()).get("x-gym");
  const confirmacion = await getConfirmacionReserva(sessionId, undefined, hostGym);
  if (!confirmacion) redirect("/reservar");

  return <ConfirmadaVista confirmacion={confirmacion} />;
}
