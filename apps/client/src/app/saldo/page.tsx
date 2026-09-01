import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { getEsMiembro, getPerfilResumenMiembro } from "@gym/data/server/agenda-miembro";
import { resolverMiembroGym } from "@gym/data/server/inquilino";
import { getContacto } from "@gym/data/server/marketing";
import { intentarReclamoPorEmail } from "@gym/data/server/registro";
import { resolveTenant } from "@gym/data/server/resolve-tenant";
import { createClient } from "@gym/data/server/supabase";

import { SinMembresia } from "../reservar/_components/sin-membresia";
import { SaldoVista } from "./_components/saldo-vista";

export const metadata: Metadata = {
  title: "Mi saldo",
  description: "Tu plan, tus clases restantes y cuándo renueva.",
};

/**
 * Saldo (#332) — the member's ONE screen on a Lista gym: plan, clases restantes, vence date,
 * and a WhatsApp "renovar" link, built from the SAME saldo/membership reads /reservar and its
 * Perfil overlay already use (`getPerfilResumenMiembro`, `getContacto`) — no new RPC. No booking
 * surface exists on Lista, so login lands here directly and every booking route (/reservar,
 * /clase/[id], /confirmada/[id]) redirects here instead; that also means THIS page — not
 * /reservar — now owns the dropped-claim self-heal (audit #10/#15) for a Lista member.
 *
 * Auth-gated exactly like /reservar (getClaims, never getSession — ADR-0001). On Cupo the route
 * still renders (same data, same gate) — nothing links to it there, per #332 AC.
 */
export default async function SaldoPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (!data?.claims?.sub) redirect("/entrar");

  let esMiembro = await getEsMiembro(supabase);
  if (!esMiembro) {
    const tenant = await resolveTenant((await headers()).get("host"), null);
    // Same defense-in-depth retry /reservar performs for a dropped claim — no aviso rendered,
    // so the version is stamped null rather than one the member never saw.
    if (tenant && (await intentarReclamoPorEmail(tenant.id, null, supabase)).ok) {
      esMiembro = await getEsMiembro(supabase);
    }
  }
  if (!esMiembro) return <SinMembresia />;

  const [miembro, perfil] = await Promise.all([
    resolverMiembroGym(supabase),
    getPerfilResumenMiembro(supabase),
  ]);
  const contacto = miembro ? await getContacto(miembro.id) : null;

  return (
    <SaldoVista
      nombre={perfil.nombre}
      marca={perfil.marca}
      membresia={perfil.membresia}
      whatsapp={contacto?.whatsapp ?? null}
    />
  );
}
