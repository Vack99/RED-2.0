import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import {
  getAgendaSemanaMiembro,
  getEsMiembro,
  getPerfilResumenMiembro,
  getSaldoMiembro,
} from "@gym/data/server/agenda-miembro";
import { getMarketingGym } from "@gym/data/server/marketing";
import { resolveTenant } from "@gym/data/server/resolve-tenant";
import { createClient } from "@gym/data/server/supabase";

import { reclamarEnHost } from "../../lib/reclamo";
import { ReservarSemana } from "./_components/reservar-semana";
import { SinMembresia } from "./_components/sin-membresia";

export const metadata: Metadata = {
  title: "Reservar",
  description: "Reserva tu clase de la semana.",
};

/** Initials for the profile avatar: first + last word of the member's name.
 *  Empty `nombre` (no cliente row yet) yields empty initials. */
function iniciales(nombre: string): string {
  const parts = nombre.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "";
  const primera = parts[0][0] ?? "";
  const ultima = parts.length > 1 ? (parts[parts.length - 1][0] ?? "") : "";
  return (primera + ultima).toUpperCase();
}

/**
 * Reservar — the member's booking home (PRD #49 S3, slice #57): the Lun–Sáb week of
 * real sessions with live derived occupancy, and real booking through the summary
 * sheet. A page-level auth gate (getClaims, never getSession — ADR-0001) redirects a
 * signed-out visitor to /entrar; the agenda + saldo reads are RLS-scoped to the
 * member's own gym/row. Paint is token-driven, so RED hosts render RED and Forge
 * hosts render Forge with no brand import here.
 *
 * A signed-in caller with no `gym_membership` row yet (audit #10/#15: a swallowed
 * claim on registro/actions.ts or auth/confirm/route.ts, or a password-reset-first
 * session that never ran the claim at all) no longer crashes here: the idempotent
 * `intentarReclamoPorEmail` re-runs once, and only if membership is STILL missing does the
 * page render the graceful SinMembresia state instead of the week.
 */
export default async function ReservarPage({
  searchParams,
}: {
  searchParams: Promise<{ perfil?: string }>;
}) {
  const { perfil: perfilParam } = await searchParams;
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const claims = data?.claims;
  if (!claims?.sub) redirect("/entrar");

  // The membership read is scoped to the gym in effect (design A1): gym-blind, a member of
  // ANOTHER gym answered true here and this retry — the only one the product has — never ran.
  const tenant = await resolveTenant((await headers()).get("host"), null);
  let esMiembro = await getEsMiembro(supabase, tenant?.id);
  if (!esMiembro) {
    // No aviso is rendered on this page — a silent defense-in-depth retry for a dropped
    // claim, not a consent screen — so `reclamarEnHost` stamps null. A refusal (nothing of
    // theirs in this gym) is a value, not a throw: fall through to the graceful state.
    await reclamarEnHost(supabase);
    esMiembro = await getEsMiembro(supabase, tenant?.id);
  }
  if (!esMiembro) {
    const gym = tenant ? await getMarketingGym(tenant.slug) : null;
    return <SinMembresia correo={claims.email ?? null} gym={gym?.brandName ?? null} />;
  }

  // Host reconciliation (audit #17 / spec §5.5) happens INSIDE the DAL: each reader resolves
  // the request's own tenant (`slugDelHost`), so a member in several gyms reads THIS gym's
  // agenda + perfil with nothing to thread through — and nothing to forget. All three run
  // concurrently — `getSaldoMiembro` is `cache()`-wrapped (perf), so reading it here costs
  // no second round trip, and folding it in (rather than awaiting it alone first) is what
  // lets the agenda/perfil reads start without waiting on it.
  const [semana, saldo, perfil] = await Promise.all([
    getAgendaSemanaMiembro(),
    getSaldoMiembro(),
    getPerfilResumenMiembro(),
  ]);

  // Modos Lista/Cupo (#332): a Lista gym has no booking surface at all — /reservar redirects to
  // /saldo. Checked here, after the fold above, off the SAME saldo DTO every booking surface
  // already reads.
  if (!saldo.reservasHabilitadas) redirect("/saldo");

  const nombre = perfil.nombre;

  return (
    <ReservarSemana
      semana={semana}
      saldo={saldo}
      nombre={nombre}
      iniciales={iniciales(nombre)}
      perfil={perfil}
      perfilInicial={perfilParam === "1"}
    />
  );
}
