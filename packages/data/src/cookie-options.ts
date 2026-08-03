import type { CookieOptionsWithName } from '@supabase/ssr'

/**
 * Shared `@supabase/ssr` `cookieOptions`, applied IDENTICALLY at all four
 * client-construction sites: `apps/admin/src/proxy.ts`, `apps/client/src/proxy.ts`,
 * `./server/supabase.ts`, and `./client.ts` (#209).
 *
 * `@supabase/ssr` routes `cookieOptions.name` into `auth.storageKey`
 * (`createServerClient.js` / `createBrowserClient.js`), which is the base key
 * the SDK chunks into the `.0`/`.1` cookie variants (`utils/chunker.js:
 * createChunks`) and later looks up again on read (`combineChunks`). A
 * mismatch at any one site means that site mints or reads a DIFFERENT cookie
 * name than the other three — sessions silently stop resolving there, they
 * don't loudly fail.
 *
 * `__Host-` requires `Secure`, `Path=/`, and no `Domain` attribute (RFC 6265bis
 * §4.1.3.2; MDN "Set-Cookie" — cookie prefixes). `Path=/` is already
 * `DEFAULT_COOKIE_OPTIONS` (`utils/constants.js`) and this repo never sets a
 * cookie `Domain`, so adding `name` + `secure` here is sufficient.
 *
 * Gated on `NODE_ENV === "production"`, mirroring the repo's existing
 * environment gate (`packages/brand/src/token-overrides.ts`): both apps run
 * bare `next dev` over http on `*.localhost` (ADR-0012), and Chrome + Safari
 * both REJECT `__Host-`-prefixed cookies set over plain http — even on
 * localhost (verified: httpwg/http-extensions#2605's compatibility table, and
 * the still-open Chromium bug at issues.chromium.org/issues/40202941; Firefox
 * is the only engine of the three that accepts them there). Shipping this
 * unconditionally would silently break local sign-in in the two most-used dev
 * browsers. Every real deploy (production AND every Vercel preview) runs
 * `next build` (`NODE_ENV=production`) and is always served over https, so
 * nothing that actually ships is left unhardened.
 */
const isProd = process.env.NODE_ENV === 'production'

export const SUPABASE_COOKIE_OPTIONS: CookieOptionsWithName | undefined = isProd
  ? { name: '__Host-sb-auth-token', secure: true }
  : undefined

/**
 * Same gate, for the plain `gym` tenant cookie both `proxy.ts` files set
 * outside `@supabase/ssr` (it is presentation-only, ADR-0008, not an auth
 * cookie — but it is still cookie state on the same shared `ibookit.lat`
 * registrable domain, so it gets the same treatment).
 */
export const SECURE_COOKIES = isProd
