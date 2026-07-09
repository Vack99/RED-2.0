import { headers } from "next/headers";

import { invitacionInfo, parseCodigoInvitacion } from "@gym/data/server/registro";

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
  const gym = (await headers()).get("x-gym");
  if (!gym) {
    return (
      <main style={{ padding: 20 }}>
        <h1>Sitio no reconocido</h1>
        <p>Este dominio no está asociado a ningún gimnasio, así que no es posible registrarse aquí.</p>
      </main>
    );
  }

  // An invite code (ADR-0015) shows the "Invitación de {gym} para {nombre}" identity
  // banner and threads through signup → claim. A dead/unknown code resolves to no
  // invite, and the code isn't carried, so the form stays a plain signup.
  const codigo = parseCodigoInvitacion((await searchParams).codigo);
  const info = codigo ? await invitacionInfo(codigo).catch(() => null) : null;
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
