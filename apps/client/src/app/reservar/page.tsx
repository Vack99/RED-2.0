import type { Metadata } from "next";
import { redirect } from "next/navigation";

import { getAgendaSemanaMiembro } from "@gym/data/server/agenda-miembro";
import { createClient } from "@gym/data/server/supabase";

import { ReservarSemana } from "./_components/reservar-semana";

export const metadata: Metadata = {
  title: "Reservar",
  description: "Reserva tu clase de la semana.",
};

/** Initials for the profile avatar: first + last word of the member's name,
 *  falling back to their email's first letter. */
function iniciales(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const primera = parts[0][0] ?? "";
  const ultima = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (primera + ultima).toUpperCase();
}

/**
 * Reservar — the member's booking home (PRD #49 S3, slice #56), read-only this
 * slice: the Lun–Sáb week of real sessions with derived estados + occupancy. A
 * page-level auth gate (getClaims, never getSession — ADR-0001) redirects a
 * signed-out visitor to /entrar; the agenda read itself is RLS-scoped to the
 * member's gym (agenda-miembro's seam). Paint is token-driven, so RED hosts render
 * RED and Forge hosts render Forge with no brand import here.
 */
export default async function ReservarPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/entrar");

  const semana = await getAgendaSemanaMiembro();
  const meta = claims.user_metadata as { full_name?: string } | undefined;
  const nombre = meta?.full_name ?? (typeof claims.email === "string" ? claims.email : "");

  return <ReservarSemana semana={semana} iniciales={iniciales(nombre)} />;
}
