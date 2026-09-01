import { redirect } from "next/navigation";

import { resolverMiembroGym } from "@gym/data/server/inquilino";
import { createClient } from "@gym/data/server/supabase";

import { resolveBrand } from "../../lib/brand";
import { destinoClases } from "../../lib/reserva-vista";
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
 * `?error=` is `/auth/confirm`'s failure landing, now one code per motivo (`sin-token`,
 * `tipo-no-soportado`, `code-rechazado`, `token-rechazado` — plus the pre-08-30
 * `confirmacion` catch-all, still in flight in old links, and `sin-codigo`, which `/codigo`
 * sends). The form turns it into a banner that names what happened and offers the two
 * remedies that exist: resend, or the code.
 */
export default async function EntrarPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ error?: string }>;
}) {
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  if (data?.claims?.sub) {
    // Modos Lista/Cupo (#332): a live session bounces to /saldo on Lista, /reservar on Cupo —
    // the same branch `entrarAction` reads on the login path itself.
    const miembro = await resolverMiembroGym(supabase);
    redirect(destinoClases(miembro?.reservasHabilitadas ?? true));
  }

  const [brand, sp] = await Promise.all([resolveBrand(), searchParams]);
  const LoginHero = brand.loginAnimation;
  const form = <EntrarForm motivoEnlace={sp.error ?? null} />;

  return LoginHero ? (
    <LoginHero name={brand.copy.name}>{form}</LoginHero>
  ) : (
    <AuthShell logo={brand.logo}>{form}</AuthShell>
  );
}
