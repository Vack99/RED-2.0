import { resolveBrand } from "../../../lib/brand";

import { LoginForm } from "./_components/login-form";
import { StaticLogin } from "./_components/static-login";

// Login sits OUTSIDE the (app) shell: no tab bar, and no auth gate beyond the
// proxy (which lets /login through for unauthenticated visitors).
//
// The page renders the RESOLVED brand module's optional login hero (grill lock
// (h)) with the real Supabase form slotted in as children; a module that omits a
// hero (the neutral base module, later) falls back to a clean static login. The
// brand comes from the shared `resolveBrand` helper (the same `x-brand` read the
// layout does, ADR-0012 §3).
export default async function LoginPage() {
  const brand = await resolveBrand();
  const LoginHero = brand.loginAnimation;

  return LoginHero ? (
    <LoginHero name={brand.copy.name} tagline="ADMINISTRADOR">
      <LoginForm afterHero />
    </LoginHero>
  ) : (
    <StaticLogin logo={brand.logo}>
      <LoginForm />
    </StaticLogin>
  );
}
