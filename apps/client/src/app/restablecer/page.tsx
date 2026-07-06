import { resolveBrand } from "../../lib/brand";
import { AuthShell } from "../_components/auth-shell";
import { RestablecerForm } from "./_components/restablecer-form";

/**
 * Set-new-password landing (ADR-0009). The reset link's PKCE code is exchanged at
 * /auth/confirm (which redirects here), so the recovery session is already
 * established when this renders. Framed by the same brand login hero as /entrar so
 * the recovery step feels like part of the sign-in surface, not a bare form.
 */
export default async function RestablecerPage() {
  const brand = await resolveBrand();
  const LoginHero = brand.loginAnimation;

  return LoginHero ? (
    <LoginHero name={brand.copy.name}>
      <RestablecerForm />
    </LoginHero>
  ) : (
    <AuthShell logo={brand.logo}>
      <RestablecerForm />
    </AuthShell>
  );
}
