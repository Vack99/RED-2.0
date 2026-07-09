import type { Route } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { construirUrlInvitacion } from "@gym/data/server/invitaciones";
import { invitacionInfo, parseCodigoInvitacion } from "@gym/data/server/registro";
import { resolveTenant } from "@gym/data/server/resolve-tenant";
import { createClient } from "@gym/data/server/supabase";

import { resolveBrand } from "../../lib/brand";
import { AuthShell } from "../_components/auth-shell";
import { RegistroForm } from "./_components/registro-form";

/**
 * Member self-registration. The gym is a host fact: the proxy stamps `x-gym` only
 * when the host resolves to a tenant, so an unknown host has no `x-gym` and the
 * page REFUSES rather than registering against a default gym (ADR-0009 — a
 * registro's gym is server-authoritative; the header display is UX only and the
 * server action re-resolves the gym from the host before writing).
 *
 * A recognized host frames the RED-designed form in the resolved brand's login
 * hero — the same seam /entrar uses; a module with no hero (the neutral base)
 * falls back to the static AuthShell. UI only: the form drives the already-shipped
 * Phase-3 registration + claim-by-match flow, now with the Turnstile captcha.
 */
export default async function RegistroPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ codigo?: string }>;
}) {
  const hostGym = (await headers()).get("x-gym");

  // An invite code (ADR-0015) shows the "Invitación de {gym} para {nombre}" identity
  // banner and threads through signup → claim. A dead/unknown code resolves to no
  // invite, and the code isn't carried, so the form stays a plain signup.
  const codigo = parseCodigoInvitacion((await searchParams).codigo);
  const info = codigo ? await invitacionInfo(codigo).catch(() => null) : null;

  // Cross-tenant shield (spec §5.2 / audit #17): a VALID invite must render only on its own
  // gym's client host — no mixed branding, ever. The code→row→gym chain (info.gym_slug) is
  // the authority (ADR-0008: the host is NEVER an authz input); x-gym is merely the tenant
  // the proxy resolved for THIS host. A mismatch — INCLUDING no tenant on an unmapped host —
  // hard-redirects to the code's canonical client URL (construirUrlInvitacion, the single
  // home of the gym→client-host rule, adds the ?gym= fallback for unmapped gyms).
  //
  // Loop-freedom: the redirect target is BY CONSTRUCTION a URL whose host resolves x-gym back
  // to info.gym_slug — either the mapped gym's own client host (host-wins), or the platform
  // fallback host carrying ?gym=info.gym_slug (that host is never a mapped customer domain, so
  // its override is honored). On reload, hostGym === info.gym_slug, the guard below is false,
  // and the page renders. One hop, no cycle. Dead/unknown codes (info === null) never enter
  // this branch — they keep S1's plain-signup behavior. (proven: invitaciones.test.ts round-trip)
  if (codigo && info && hostGym !== info.gym_slug) {
    const destino = await resolveTenant(null, info.gym_slug); // code slug → its gym id
    if (destino) {
      const url = await construirUrlInvitacion(
        { gymId: destino.id, gymSlug: info.gym_slug, codigo },
        await createClient(),
      );
      // Absolute cross-host URL — `as Route` is Next's sanctioned marker for an intentional
      // off-slice redirect target (typed routes only know this app's internal paths).
      if (url) redirect(url as Route);
    }
  }

  if (!hostGym) {
    return (
      <main style={{ padding: 20 }}>
        <h1>Sitio no reconocido</h1>
        <p>Este dominio no está asociado a ningún gimnasio, así que no es posible registrarse aquí.</p>
      </main>
    );
  }

  const invitacion = info ? { gym: info.gym_nombre, nombre: info.cliente_nombre } : null;

  const brand = await resolveBrand();
  const LoginHero = brand.loginAnimation;
  const form = (
    <RegistroForm
      brandName={brand.copy.name}
      codigo={invitacion ? codigo : null}
      invitacion={invitacion}
    />
  );

  return LoginHero ? (
    <LoginHero name={brand.copy.name}>{form}</LoginHero>
  ) : (
    <AuthShell logo={brand.logo}>{form}</AuthShell>
  );
}
