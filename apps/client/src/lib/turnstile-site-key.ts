/**
 * Cloudflare Turnstile public sitekey — the one home for the 4 forms that render the widget
 * (contacto, registro, activar, vincular). Fails LOUD: a missing `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
 * throws at module load rather than silently falling back to Cloudflare's documented ALWAYS-PASS
 * test sitekey, which would make the captcha a no-op in an unconfigured (e.g. prod) environment.
 * `NEXT_PUBLIC_*` vars are inlined at build time, so this throw surfaces at build/first-render, not
 * at some later request. Set it in apps/client/.env.local — see apps/client/.env.example, which
 * ships Cloudflare's test pair as the checked-in dev default.
 */
const value = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
if (!value) {
  throw new Error("NEXT_PUBLIC_TURNSTILE_SITE_KEY is not set — see apps/client/.env.example");
}

export const TURNSTILE_SITE_KEY = value;
