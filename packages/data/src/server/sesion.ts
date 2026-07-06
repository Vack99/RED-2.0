import "server-only";

import { createClient, type SupabaseServer } from "./supabase";

/**
 * Member session DAL — the auth calls behind the client app's unstyled `/entrar`
 * (login + forgot-password) and `/restablecer` (set a new password). Email+password
 * only, per ADR-0009 (no phone-OTP, no social). Authorization elsewhere uses
 * `getClaims()`/`getUser()`, never `getSession()` (ADR-0001). `client` is injectable
 * for tests. Custom SMTP is #27 HITL (ADR-0014) — these use the default sender.
 */

/** A discriminated result so the actions render one message surface. */
export type SesionResultado = { ok: true } | { ok: false; error: string };

/** Email+password sign-in. A wrong credential collapses to one opaque message
 *  (never reveal which field failed) — but an unconfirmed email is surfaced
 *  distinctly (not "wrong password") so the form can prompt a confirmation
 *  check instead. */
export async function iniciarSesion(
  email: string,
  password: string,
  client?: SupabaseServer,
): Promise<SesionResultado> {
  const supabase = client ?? (await createClient());
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (!error) return { ok: true };
  if (error.code === "email_not_confirmed") {
    return {
      ok: false,
      error: "Confirma tu correo antes de entrar. Revisa el enlace que te enviamos.",
    };
  }
  return { ok: false, error: "Correo o contraseña incorrectos." };
}

/** Send the forgot-password email; `redirectTo` is the `/restablecer` landing.
 *  Always resolves ok (never leak whether an address is registered). */
export async function solicitarReset(
  email: string,
  redirectTo: string,
  client?: SupabaseServer,
): Promise<SesionResultado> {
  const supabase = client ?? (await createClient());
  await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
  return { ok: true };
}

/**
 * Exchange a PKCE `code` (from the confirmation / recovery email link) for a
 * session, establishing it on `client`. `@supabase/ssr` uses the PKCE flow with
 * the DEFAULT Supabase sender (ADR-0014 — no custom SMTP/template in dev/test),
 * so the email link lands on a route with `?code=…` rather than a token hash.
 */
export async function confirmarCodigo(
  code: string,
  client?: SupabaseServer,
): Promise<SesionResultado> {
  const supabase = client ?? (await createClient());
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  return error ? { ok: false, error: error.message } : { ok: true };
}

/** Set a new password for the recovery session established by the reset link. */
export async function actualizarPassword(
  password: string,
  client?: SupabaseServer,
): Promise<SesionResultado> {
  const supabase = client ?? (await createClient());
  const { error } = await supabase.auth.updateUser({ password });
  return error ? { ok: false, error: error.message } : { ok: true };
}
