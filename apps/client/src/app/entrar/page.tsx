import { redirect } from "next/navigation";

import { createClient } from "@gym/data/server/supabase";

import { resolveBrand } from "../../lib/brand";
import { AuthShell } from "../_components/auth-shell";
import { EntrarForm } from "./_components/entrar-form";

/**
 * Member login. The resolved brand's login hero (grill lock (h)) frames the real
 * sign-in form as children — the same seam the admin login uses; a module with no
 * hero (the neutral base) falls back to a static shell. UI only: the form drives
 * the already-shipped Phase-3 actions (email+password sign-in + forgot-password).
 *
 * A LIVE session never reaches the form: the same `getClaims()` gate `/reservar` uses
 * (never `getSession()` — ADR-0001) bounces an already-signed-in member to the panel.
 * Without it, a member whose session was healthy and auto-refreshing still saw a password
 * prompt every time any link (the drawer's own CTAs included) landed them here.
 *
 * `?error=confirmacion` is `/auth/confirm`'s failure landing (an expired or already-burnt
 * email link). Nothing read it, so that redirect rendered a blank login screen with no
 * explanation; it is now passed to the form as a banner.
 */
export default async function EntrarPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) redirect("/reservar");

  const [brand, sp] = await Promise.all([resolveBrand(), searchParams]);
  const LoginHero = brand.loginAnimation;
  const form = <EntrarForm enlaceInvalido={sp.error === "confirmacion"} />;

  return LoginHero ? (
    <LoginHero name={brand.copy.name}>{form}</LoginHero>
  ) : (
    <AuthShell logo={brand.logo}>{form}</AuthShell>
  );
}
