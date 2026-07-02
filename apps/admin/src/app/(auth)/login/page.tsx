import { headers } from "next/headers";

import { brands, DEFAULT_BRAND, type BrandId } from "@gym/brand";

import { LoginForm } from "./_components/login-form";
import { StaticLogin } from "./_components/static-login";

// Login sits OUTSIDE the (app) shell: no tab bar, and no auth gate beyond the
// proxy (which lets /login through for unauthenticated visitors).
//
// The page renders the RESOLVED brand module's optional login hero (grill lock
// (h)) with the real Supabase form slotted in as children; a module that omits a
// hero (the neutral base module, later) falls back to a clean static login. The
// `x-brand` header is read + validated exactly as the layouts do (ADR-0012 §3):
// it arrives from HTTP, so an absent/forged value falls back to DEFAULT_BRAND.
export default async function LoginPage() {
  const stamped = (await headers()).get("x-brand");
  const brandId: BrandId =
    stamped !== null && Object.hasOwn(brands, stamped) ? (stamped as BrandId) : DEFAULT_BRAND;
  const brand = brands[brandId];
  const LoginHero = brand.loginAnimation;

  const form = <LoginForm />;

  return LoginHero ? (
    <LoginHero name={brand.copy.name}>{form}</LoginHero>
  ) : (
    <StaticLogin logo={brand.logo}>{form}</StaticLogin>
  );
}
