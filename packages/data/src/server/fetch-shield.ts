import "server-only";

/**
 * The `fetch` every SERVER Supabase client runs on (the two `proxy.ts` files and
 * `./supabase`'s cookie + anon clients). It bounds the two request shapes that can
 * stall for minutes without consequence, and deliberately touches nothing else.
 *
 * Why it exists — 2026-08-29 (`docs/Context/2026-08-29-supabase-degradation-jwks-HANDOFF.md`):
 * every request that entered Cloudflare at the IAD colo (i.e. from the `iad1` Vercel
 * functions) was intermittently stalled — 65 requests over 5 s in 24 h, ALL of them at
 * IAD, worst 266 s, every one returning HTTP 200; SJC/LHR/SIN/LAX/FRA/DFW/PDX produced
 * zero. `jwks.json` alone stalled 27 of 36 times from IAD and 0 of 36 from SJC. Origin
 * side was healthy throughout (GoTrue self-reported the same jwks path at avg 3.9 ms),
 * so the delay sat in the path between the IAD colo and the Supabase origin. Pinning
 * both apps to `pdx1` (`vercel.json`, same AWS region as the DB) removes today's failing
 * path; this module is the bound, so the next such stall degrades instead of hanging.
 *
 * What it bounds:
 *   - `GET /auth/v1/.well-known/jwks.json` — 2.5 s, then the PINNED key set below. auth-js
 *     re-fetches on any unknown `kid` and re-caches on the next miss, so a live response
 *     always wins as soon as one arrives.
 *   - every other GET/HEAD (PostgREST reads) — 8 s, then ONE UNTIMED retry. Healthy p-max
 *     from IAD was ~800 ms against 40–260 s stalls, so 8 s separates them with no false
 *     positives, and the untimed second attempt means the worst case is still "slow but it
 *     renders" — never a 500 the operator did not get before.
 *
 * What it NEVER touches — every POST/PATCH/DELETE, which includes `POST /auth/v1/token`
 * and every `.rpc()` call. Two separate reasons, both load-bearing:
 *   - a timed-out write may already have committed, so a retry could duplicate a sale;
 *   - aborting a refresh past GoTrue's ~10 s reuse interval makes the retry come back
 *     `refresh_token_already_used`, which `apps/client/src/proxy.ts` classifies as a dead
 *     session and rides the cookie teardown — i.e. real sign-outs. Do NOT "complete" this
 *     shield by adding a timeout there.
 * Read-only RPCs are POSTs too (`marcadas_presencia`, `contar_reservas_activas`, …) and are
 * therefore NOT bounded here; separating them needs a writer/reader allowlist guarded
 * against `tools/guards/denial-suite.ts`, which is a bigger change than this one.
 */

/**
 * The project's live JWKS, pinned. Public key material (this is the endpoint's own public
 * response), so committing it is safe — and it is a small integrity WIN: verification falls
 * back to a key in the repo rather than to whatever the wire hands us.
 *
 * Read from `https://hjppxawglmukfvsgmcog.supabase.co/auth/v1/.well-known/jwks.json` on
 * 2026-08-29. ROTATION OBLIGATION: if the Auth signing key is ever rotated, replace this
 * block in the same change. A stale pin is only ever consulted while `jwks.json` is
 * unreachable — but there it would hand auth-js a `kid` it cannot match, and every operator
 * gets bounced to the login form. `fetch-shield.test.ts` asserts the key still imports.
 */
export const JWKS_FALLBACK = {
  keys: [
    {
      alg: "ES256",
      crv: "P-256",
      ext: true,
      key_ops: ["verify"],
      kid: "76da07da-65ca-404a-a1ab-00c3d0b59d38",
      kty: "EC",
      use: "sig",
      x: "WmTwZR8rVIGrBbU2NZuH3Nxx6DjEbyum9Hy9u2a7g6E",
      y: "2BVPEIE-tDazZdvF-rt03hfOcYD6F5YYQ7Wq22na9e4",
    },
  ],
};

const JWKS_PATH = "/auth/v1/.well-known/jwks.json";
const JWKS_TIMEOUT_MS = 2_500;
const READ_TIMEOUT_MS = 8_000;

/**
 * One attempt, bounded by an `AbortController` (NOT `AbortSignal.timeout`, which rejects
 * with `TimeoutError` — postgrest-js only stops its own 3× backoff retry loop on a name of
 * `AbortError`, so a `TimeoutError` would fall through and cost ~47 s instead of bounding
 * anything). `clearTimeout` fires when the RESPONSE resolves, i.e. at the headers: the
 * budget is time-to-first-byte, so a large roster read is never aborted mid-body.
 */
function conLimite(input: RequestInfo | URL, init: RequestInit | undefined, ms: number) {
  const limite = new AbortController();
  const timer = setTimeout(() => limite.abort(), ms);
  const signal = init?.signal
    ? AbortSignal.any([init.signal, limite.signal])
    : limite.signal;
  return fetch(input, { ...init, signal }).finally(() => clearTimeout(timer));
}

export const fetchBlindado: typeof fetch = async (input, init) => {
  const url = input instanceof Request ? input.url : String(input);

  if (url.includes(JWKS_PATH)) {
    try {
      return await conLimite(input, init, JWKS_TIMEOUT_MS);
    } catch (error) {
      // Only ever reached on a timeout/network failure: a real HTTP response — including
      // a 4xx/5xx, and including a rotated key set — resolves and wins.
      console.warn("[fetch-shield] jwks.json unreachable, verifying with the pinned key set", error);
      return new Response(JSON.stringify(JWKS_FALLBACK), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
  }

  const method = (init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
  if (method !== "GET" && method !== "HEAD") return fetch(input, init);

  try {
    return await conLimite(input, init, READ_TIMEOUT_MS);
  } catch (error) {
    // The CALLER cancelled (an abandoned request, not a stall) — do not resurrect it.
    if (init?.signal?.aborted) throw error;
    return fetch(input, init);
  }
};
