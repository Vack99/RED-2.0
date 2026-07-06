import "server-only";

/**
 * Cloudflare Turnstile server-side verification — the captcha half of the contact-form abuse posture
 * (the per-IP limit is the DB half, enforced in enviar_mensaje_contacto). The server action calls this
 * BEFORE the intake RPC; a false result blocks the submission.
 *
 * Keyed entirely off env vars: the secret is `TURNSTILE_SECRET_KEY`, defaulting to Cloudflare's
 * documented ALWAYS-PASSES test secret so dev + tests succeed without real keys (production keys are the
 * owner's post-queue step). The `fetchImpl`/`secret` seams keep it unit-testable (ADR-0001) with no
 * network. Fails CLOSED: a missing token, a non-`success` response, or a network error all return false.
 */
const TEST_SECRET = "1x0000000000000000000000000000000AA";
const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export async function verificarTurnstile(
  token: string | null,
  ip: string | null,
  opts?: { secret?: string; fetchImpl?: typeof fetch },
): Promise<boolean> {
  if (!token) return false;
  const secret = opts?.secret ?? process.env.TURNSTILE_SECRET_KEY ?? TEST_SECRET;
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
