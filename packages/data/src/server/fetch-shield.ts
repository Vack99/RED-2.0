import "server-only";

/**
 * The `fetch` every SERVER Supabase client runs on — five construction sites (the two
 * `proxy.ts` files, `./supabase`'s cookie + anon clients, `./resolve-tenant`'s anon client),
 * kept exhaustive by `tools/guards/fetch-shield-coverage.test.ts` because the fifth was
 * missed on the first build. It bounds the two request shapes that can stall for minutes
 * without consequence, and deliberately touches nothing else.
 *
 * Why it exists — 2026-08-29 (`docs/Context/2026-08-29-supabase-degradation-jwks-HANDOFF.md`,
 * `docs/adr/0017-vercel-function-region-colocated-with-supabase.md`): every request that
 * entered Cloudflare at the IAD colo (i.e. from the `iad1` Vercel functions) was
 * intermittently stalled — 65 requests over 5 s in 24 h, ALL of them at IAD, worst 266 s,
 * every one returning HTTP 200; SJC/LHR/SIN/LAX/FRA/DFW/PDX produced zero. `jwks.json` alone
 * stalled 27 of 36 times from IAD and 0 of 36 from SJC. Origin side was healthy throughout
 * (GoTrue self-reported the same jwks path at avg 3.9 ms), so the delay sat in the path
 * between the IAD colo and the Supabase origin. Pinning both apps to `pdx1` (`vercel.json`,
 * same AWS region as the DB) removes today's failing path; this module is the bound, so the
 * next such stall degrades instead of hanging.
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
 * Read-only RPCs are POSTs by default and would therefore NOT be bounded here — so the
 * ones on the render paths now ask postgrest for a real GET (`.rpc(fn, args, { get: true })`,
 * legal only for a `STABLE`/`IMMUTABLE` function with scalar args) and are bounded like any
 * other read. That conversion also opts them into postgrest-js's OWN retry loop — 3 attempts,
 * 1 s/2 s/4 s backoff, on a 520/503 or a network error, with `RETRYABLE_METHODS =
 * GET/HEAD/OPTIONS` so every POST is excluded (`PostgrestBuilder.ts`) — which can only make a
 * failing read slower, never turn a passing one into a failure.
 *
 * Deliberately still POST, and therefore still unbounded:
 *   - `invitacion_info` — the bearer invite code (ADR-0015) must never land in a URL, i.e. in
 *     an edge/CDN access log;
 *   - `gym_id_por_host` — its `p_app ?? null` would serialise as the literal text `'null'` in
 *     a query string and match no row;
 *   - `contar_reservas_activas` / `contar_reservas_activas_miembro` — `uuid[]` args;
 *   - `mi_membresia` — plpgsql with no volatility marker, i.e. VOLATILE: PostgREST refuses GET;
 *   - `ensure_week_materialized` — VOLATILE, and it writes.
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
 * The ONE place `input`/`init` are unpacked. A `Request` input carries its own url, method
 * AND signal; a string/URL input carries none of them and `init` supplies all three. Reading
 * them per-branch is how the Request-carried signal went unread.
 */
function unpack(input: RequestInfo | URL, init: RequestInit | undefined) {
  const request = input instanceof Request ? input : undefined;
  return {
    url: request ? request.url : String(input),
    method: (init?.method ?? request?.method ?? "GET").toUpperCase(),
    callerSignal: init?.signal ?? request?.signal ?? undefined,
  };
}

/**
 * One attempt, bounded by an `AbortController` (NOT `AbortSignal.timeout`, which rejects
 * with `TimeoutError` — postgrest-js only stops its own 3× backoff retry loop on a name of
 * `AbortError`, so a `TimeoutError` would fall through and cost ~47 s instead of bounding
 * anything). `clearTimeout` fires when the RESPONSE resolves, i.e. at the headers: the
 * budget is time-to-first-byte, so a large roster read is never aborted mid-body. The
 * caller's own signal is merged in, so cancelling the request still cancels the attempt.
 */
function withTimeout(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  ms: number,
  callerSignal: AbortSignal | null | undefined,
) {
  const limit = new AbortController();
  const timer = setTimeout(() => limit.abort(), ms);
  const signal = callerSignal ? AbortSignal.any([callerSignal, limit.signal]) : limit.signal;
  return fetch(input, { ...init, signal }).finally(() => clearTimeout(timer));
}

export const shieldedFetch: typeof fetch = async (input, init) => {
  const { url, method, callerSignal } = unpack(input, init);

  if (url.includes(JWKS_PATH)) {
    try {
      return await withTimeout(input, init, JWKS_TIMEOUT_MS, callerSignal);
    } catch (error) {
      // The CALLER cancelled (an abandoned render, not a stall) — the pinned key set answers
      // an unreachable endpoint, never a cancellation.
      if (callerSignal?.aborted) throw error;
      // Only ever reached on a timeout/network failure: a real HTTP response — including
      // a 4xx/5xx, and including a rotated key set — resolves and wins.
      console.warn("[fetch-shield] jwks.json unreachable, verifying with the pinned key set", error);
      return new Response(JSON.stringify(JWKS_FALLBACK), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
  }

  if (method !== "GET" && method !== "HEAD") return fetch(input, init);

  try {
    return await withTimeout(input, init, READ_TIMEOUT_MS, callerSignal);
  } catch (error) {
    // The CALLER cancelled (an abandoned request, not a stall) — do not resurrect it.
    if (callerSignal?.aborted) throw error;
    return fetch(input, init);
  }
};
