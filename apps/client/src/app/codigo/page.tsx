import { redirect } from "next/navigation";

import { createClient } from "@gym/data/server/supabase";

import { resolveBrand } from "../../lib/brand";
import { AuthShell } from "../_components/auth-shell";
import { CodigoForm } from "./_components/codigo-form";

/**
 * "Escribe tu código": the OTP fallback door the confirmation mail points at when the link
 * fails ("¿El enlace no funciona? Escribe este código en la página de acceso"). Framed by
 * the same brand login hero as /entrar — it is part of the sign-in surface, not a
 * troubleshooting page.
 *
 * Takes no query params on purpose: the address is typed here rather than carried in the
 * URL, which is where a member's email would otherwise land in CDN logs and third-party
 * Referers. A LIVE session never reaches the form (same `getClaims()` gate as /entrar —
 * never `getSession()`, ADR-0001): someone already signed in has nothing to confirm.
 */
export default async function CodigoPage() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) redirect("/reservar");

  const brand = await resolveBrand();
  const LoginHero = brand.loginAnimation;

  return LoginHero ? (
    <LoginHero name={brand.copy.name}>
      <CodigoForm />
    </LoginHero>
  ) : (
    <AuthShell logo={brand.logo}>
      <CodigoForm />
    </AuthShell>
  );
}
