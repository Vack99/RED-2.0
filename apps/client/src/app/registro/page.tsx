import { headers } from "next/headers";

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
 * The invite door lives at /activar (ADR-0015 amended); /registro is plain signup.
 */
export default async function RegistroPage() {
  const hostGym = (await headers()).get("x-gym");

  if (!hostGym) {
    return (
      <main style={{ padding: 20 }}>
        <h1>Sitio no reconocido</h1>
        <p>Este dominio no está asociado a ningún gimnasio, así que no es posible registrarse aquí.</p>
      </main>
    );
  }

  const brand = await resolveBrand();
  const LoginHero = brand.loginAnimation;
  const form = <RegistroForm brandName={brand.copy.name} />;

  return LoginHero ? (
    <LoginHero name={brand.copy.name}>{form}</LoginHero>
  ) : (
    <AuthShell logo={brand.logo}>{form}</AuthShell>
  );
}
