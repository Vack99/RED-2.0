import { resolveBrand } from "../../lib/brand";
import { AuthShell } from "../_components/auth-shell";
import { EntrarForm } from "./_components/entrar-form";

/**
 * Member login. The resolved brand's login hero (grill lock (h)) frames the real
 * sign-in form as children — the same seam the admin login uses; a module with no
 * hero (the neutral base) falls back to a static shell. UI only: the form drives
 * the already-shipped Phase-3 actions (email+password sign-in + forgot-password).
 */
export default async function EntrarPage() {
  const brand = await resolveBrand();
  const LoginHero = brand.loginAnimation;

  return LoginHero ? (
    <LoginHero name={brand.copy.name}>
      <EntrarForm />
    </LoginHero>
  ) : (
    <AuthShell logo={brand.logo}>
      <EntrarForm />
    </AuthShell>
  );
}
