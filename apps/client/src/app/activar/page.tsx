import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { construirUrlInvitacion } from "@gym/data/server/invitaciones";
import { invitacionInfo, parseCodigoInvitacion } from "@gym/data/server/registro";
import { resolveTenant } from "@gym/data/server/resolve-tenant";
import { createClient } from "@gym/data/server/supabase";

import { resolveBrand } from "../../lib/brand";
import { AuthShell } from "../_components/auth-shell";
import { ActivarForm } from "./_components/activar-form";
import { VincularForm } from "./_components/vincular-form";

/**
 * Single-email activation door (PRD #130). The invitation email lands here: the member
 * confirms the email their gym registered and passes the bot check; the server action
 * provisions + logs them in (edge function), then hands off to the set-password step.
 *
 * Same host contract as /registro (ADR-0008/0009): the gym is a HOST fact (`x-gym`,
 * stamped by the proxy only for a recognized host / `?gym=` fallback), and a VALID
 * invite must render only on its own gym's client host — the cross-tenant shield below
 * redirects a mismatch to the code's canonical activation URL. A dead/unknown code
 * degrades gracefully (the door still asks for the email; the edge function is the
 * real gate). An unrecognized host refuses outright.
 */
export default async function ActivarPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ codigo?: string; correo?: string }>;
}) {
  const hostGym = (await headers()).get("x-gym");

  const sp = await searchParams;
  const codigo = parseCodigoInvitacion(sp.codigo);
  // Pre-filled email rides the invite URL as a DISPLAY param (PRD #130, owner 2026-07-15). Empty/absent
  // falls back to the typed-input mode; enforcement stays server-side (the edge fn matches what's submitted).
  const correo = sp.correo?.trim().toLowerCase() || null;
  const info = codigo ? await invitacionInfo(codigo).catch(() => null) : null;

  // Cross-tenant shield (mirrors /registro): the code→row→gym chain (info.gym_slug) is
  // the authority; a mismatch — including no tenant on an unmapped host — hard-redirects
  // to the code's canonical activation URL. construirUrlInvitacion is the single home of the
  // gym→client-host rule (adds the ?gym= fallback for unmapped gyms); `ruta` lands it on this
  // activation door. One hop, no cycle: on reload hostGym === info.gym_slug and this guard is false.
  if (codigo && info && hostGym !== info.gym_slug) {
    const destino = await resolveTenant(null, info.gym_slug);
    if (destino) {
      const url = await construirUrlInvitacion(
        { gymId: destino.id, gymSlug: info.gym_slug, codigo, ruta: "/activar" },
        await createClient(),
      );
      if (url) redirect(url as Route);
    }
  }

  if (!hostGym) {
    return (
      <main style={{ padding: 20 }}>
        <h1>Sitio no reconocido</h1>
        <p>Este dominio no está asociado a ningún gimnasio, así que no es posible activar tu cuenta aquí.</p>
      </main>
    );
  }

  const invitacion = info ? { gym: info.gym_nombre, nombre: info.cliente_nombre } : null;

  // §4 Step 1 (audit 2026-07-22): if the member is ALREADY signed in on this device, skip
  // the email door — bind the invite in one click. getClaims (never getSession — ADR-0001)
  // gates the short-circuit; only for a valid code with a resolved invite identity.
  let sesionActiva = false;
  if (codigo && invitacion) {
    const { data: claims } = await (await createClient()).auth.getClaims();
    sesionActiva = Boolean(claims?.claims?.sub);
  }

  const brand = await resolveBrand();
  const LoginHero = brand.loginAnimation;
  const form =
    sesionActiva && codigo && invitacion ? (
      <VincularForm codigo={codigo} gym={invitacion.gym} />
    ) : (
      <ActivarForm codigo={invitacion ? codigo : null} invitacion={invitacion} correo={correo} />
    );

  return LoginHero ? (
    <LoginHero name={brand.copy.name}>{form}</LoginHero>
  ) : (
    <AuthShell logo={brand.logo}>{form}</AuthShell>
  );
}
