import { redirect } from "next/navigation";

import { parseCodigoInvitacion } from "@gym/data/server/registro";
import { createClient } from "@gym/data/server/supabase";

import { resolveBrand } from "../../../lib/brand";
import { AuthShell } from "../../_components/auth-shell";
import { ActivarContrasenaForm } from "./_components/activar-contrasena-form";

/**
 * Activation finish line (issue #133). The activation door established a live session
 * in the previous request, so this renders the set-password step: the registered email
 * read-only, password + confirm, and the terms/privacy gate (validation-only, parity
 * with self-registration). Submitting sets the password THEN claims the paid row.
 *
 * Requires a session: without one (expired recovery / cold deep-link) there is no user
 * to set a password for, so we bounce back to the activation door (or /entrar). An
 * existing-account holder resetting their own password sees exactly this step.
 */
export default async function ActivarContrasenaPage({
  searchParams,
}: {
  readonly searchParams: Promise<{ codigo?: string }>;
}) {
  const codigo = parseCodigoInvitacion((await searchParams).codigo);

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  const email = data.user?.email;
  if (!email) {
    redirect(codigo ? `/activar?codigo=${codigo}` : "/entrar");
  }

  const brand = await resolveBrand();
  const LoginHero = brand.loginAnimation;
  const form = <ActivarContrasenaForm email={email} codigo={codigo} />;

  return LoginHero ? (
    <LoginHero name={brand.copy.name}>{form}</LoginHero>
  ) : (
    <AuthShell logo={brand.logo}>{form}</AuthShell>
  );
}
