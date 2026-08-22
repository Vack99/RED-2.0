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
 *  (never reveal which field failed) — but an unconfirmed email, and a throttled
 *  attempt, are surfaced distinctly (not "wrong password"): the first so the form
 *  can prompt a confirmation check, the second because telling someone their
 *  password is wrong when the server never checked it sends them to reset a
 *  password that works. Neither leaks whether the address exists.
 *
 *  The password is trimmed on the SAME rule every set site applies (`registroSchema`,
 *  `actualizarPassword`): an autofilled or pasted trailing space otherwise fails a
 *  correct password invisibly. Set and verify must move together — trimming one alone
 *  is the bug, in either direction. The one exception is historical: an account whose
 *  hash was stored BEFORE trim parity can legitimately contain edge whitespace, so a
 *  credential failure on a padded input retries once with the raw string (below). */
export async function iniciarSesion(
  email: string,
  password: string,
  client?: SupabaseServer,
): Promise<SesionResultado> {
  const supabase = client ?? (await createClient());
  const correo = email.trim();
  const { error } = await supabase.auth.signInWithPassword({
    email: correo,
    password: password.trim(),
  });
  if (!error) return { ok: true };
  if (error.code === "email_not_confirmed") {
    return {
      ok: false,
      error: "Confirma tu correo antes de entrar. Revisa el enlace que te enviamos.",
    };
  }
  // GoTrue throttles by IP+email; the 429 arrives as `over_request_rate_limit` (and the
  // status, for any 429-class code the SDK adds later).
  if (error.code === "over_request_rate_limit" || error.status === 429) {
    return {
      ok: false,
      error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
    };
  }
  // Legacy cohort: a hash set before trim parity can hold edge whitespace, so the padded
  // input the trimmed attempt just rejected may be the literally correct one. One retry,
  // only on a genuine credential failure (never on a throttle — that would spend a second
  // attempt against the limit) and only when trimming actually changed something.
  if (password !== password.trim()) {
    const crudo = await supabase.auth.signInWithPassword({ email: correo, password });
    if (!crudo.error) return { ok: true };
  }
  return { ok: false, error: "Correo o contraseña incorrectos." };
}

/** Send the forgot-password email; `redirectTo` is the `/restablecer` landing.
 *  Always resolves ok (never leak whether an address is registered) — but the outward
 *  silence is for the caller, not for us: a swallowed error made a throttled or bounced
 *  send look exactly like a delivered one, so a member reporting "no llegó el correo" left
 *  no trace at all. The failure is logged server-side (never the address — the log would
 *  re-create the enumeration channel the response refuses). */
export async function solicitarReset(
  email: string,
  redirectTo: string,
  client?: SupabaseServer,
): Promise<SesionResultado> {
  const supabase = client ?? (await createClient());
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo });
  if (error) {
    console.error("solicitarReset: resetPasswordForEmail falló", {
      code: error.code,
      status: error.status,
      message: error.message,
      redirectTo,
    });
  }
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

/** Set a new password for the recovery session established by the reset link (and for
 *  `completarActivacion`'s set-password step). Trimmed on the same rule `iniciarSesion`
 *  verifies with — see the parity note there. */
export async function actualizarPassword(
  password: string,
  client?: SupabaseServer,
): Promise<SesionResultado> {
  const supabase = client ?? (await createClient());
  const { error } = await supabase.auth.updateUser({ password: password.trim() });
  return error ? { ok: false, error: error.message } : { ok: true };
}
