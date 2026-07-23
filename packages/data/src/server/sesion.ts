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
 * Send a passwordless sign-in (magic link) to an EXISTING account only
 * (`shouldCreateUser:false` — never provisions here). The activation door's
 * `cuenta_existente` rail (audit §4): a pre-existing account gets inbox proof via a
 * magic link instead of a password-reset mail, so the member signs straight in with no
 * gratuitous password change. `emailRedirectTo` is the `/auth/confirm` landing that
 * binds this gym's membership (codigo+firma) on the verified session. Always resolves
 * ok (never leak whether an address is registered).
 */
export async function enviarMagicLink(
  email: string,
  emailRedirectTo: string,
  client?: SupabaseServer,
): Promise<SesionResultado> {
  const supabase = client ?? (await createClient());
  await supabase.auth.signInWithOtp({
    email: email.trim(),
    options: { shouldCreateUser: false, emailRedirectTo },
  });
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

/** The OTP types an auth-mail `token_hash` link can carry (Send Email Hook, #75).
 *  A subset of Supabase's `EmailOtpType`; the `/auth/confirm` route validates the
 *  raw `type` param against this union before calling. */
export type TipoTokenHash = "email" | "recovery" | "email_change";

/**
 * Verify a `token_hash` OTP from an auth-mail link and establish the session on
 * `client`. The Send Email Hook (#75) mints `/auth/confirm?token_hash&type` on the
 * gym's own host instead of the PKCE `?code=` the default sender used, so this is the
 * token-hash sibling of `confirmarCodigo`. `type` is the OTP type the link carried;
 * the route narrows it to `TipoTokenHash` before calling.
 */
export async function confirmarTokenHash(
  type: TipoTokenHash,
  tokenHash: string,
  client?: SupabaseServer,
): Promise<SesionResultado> {
  const supabase = client ?? (await createClient());
  const { error } = await supabase.auth.verifyOtp({ type, token_hash: tokenHash });
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
