import "server-only";

/**
 * Cloudflare Turnstile server-side verification — the captcha half of the public-write abuse posture,
 * shared by the contact-form intake (#53; its DB half is the per-IP limit in enviar_mensaje_contacto)
 * and registration (#55; it protects the shared-project signUp quota). The server action calls this
 * BEFORE the write (the intake RPC / the Phase-3 signUp); a false result blocks the submission.
 *
 * Keyed entirely off env vars: the secret is `TURNSTILE_SECRET_KEY`. Fails LOUD, not closed-by-accident:
 * a missing `TURNSTILE_SECRET_KEY` throws rather than silently falling back to Cloudflare's documented
 * ALWAYS-PASS test secret, which would make the captcha a no-op in an unconfigured environment. The
 * `fetchImpl`/`secret` seams keep it unit-testable (ADR-0001) with no network. Otherwise fails CLOSED: a
 * missing token, a non-`success` response, or a network error all return false.
 */
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verificarTurnstile(
  token: string | null,
  ip: string | null,
  opts?: { secret?: string; fetchImpl?: typeof fetch },
): Promise<boolean> {
  if (!token) return false;
  const secret = opts?.secret ?? process.env.TURNSTILE_SECRET_KEY;
  if (!secret) {
    throw new Error("TURNSTILE_SECRET_KEY is not set — see apps/client/.env.example");
  }
  const doFetch = opts?.fetchImpl ?? fetch;

  const body = new URLSearchParams({ secret, response: token });
  if (ip) body.set("remoteip", ip);

  try {
    const res = await doFetch(SITEVERIFY_URL, { method: "POST", body });
    const data = (await res.json()) as { success?: boolean };
    return data.success === true;
  } catch {
    return false;
  }
}
