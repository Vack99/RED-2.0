import { defineConfig, devices } from "@playwright/test";

/**
 * The repo's only browser-level suite: the session-persistence regression shield
 * (`e2e/session.spec.ts`). It is deliberately NOT in the pre-commit gate — `pnpm lint`,
 * `pnpm typecheck` and `pnpm test` are untouched. Like `pnpm test:denial` (AGENTS.md),
 * this is a **documented pre-merge convention**: run `pnpm test:e2e` green before a
 * change to the auth/session surface fast-forwards to `main`.
 *
 * ## Why it builds instead of running `next dev`
 *
 * `next dev` is BANNED on this machine — on Node 24 it fork-bombs and has OOM'd the
 * whole PC. So `webServer.command` is `next build && next start`. The command cannot
 * start a dev server even by accident, and Playwright's port probe is what waits for
 * it. `reuseExistingServer: false` keeps that honest: every run proves a freshly built
 * production bundle, never whatever happens to be listening on the port. The cost is a
 * ~1 min build per run, which `webServer.timeout` covers.
 *
 * A production build is also the *only* faithful target here, because
 * `@gym/data`'s `SUPABASE_COOKIE_OPTIONS` is a `NODE_ENV === "production"` ternary that
 * webpack CONSTANT-FOLDS at build time (verified in `.next/server`: the chunk literally
 * contains `{name:"__Host-sb-auth-token",secure:!0}`). Setting `NODE_ENV` at runtime
 * cannot move it. So this suite exercises the real production cookie — prefix, `Secure`
 * and all — rather than the dev fallback.
 *
 * That works over plain http only because Chromium treats `*.localhost` as a
 * trustworthy origin. NOTE: `cookie-options.ts` claims Chrome "REJECTS `__Host-`
 * cookies set over plain http — even on localhost". That is STALE for the Chromium
 * this Playwright pins (1.61.1 / rev 1228): the cookie is set and read back fine here.
 * Nothing depends on that being fixed — if a future Chromium re-tightens it, this suite
 * fails loudly at sign-in, which is the correct signal.
 *
 * ## Tenant
 *
 * `red-demo` is the sanctioned sandbox twin. `red-demo-client.localhost` is its
 * client-app `gym_domain` row (migration
 * `20260706160100_seed_red_demo_client_and_content.sql`), so the HOST arm of
 * `resolveTenant` wins outright and no `?gym=` override or `gym` cookie is involved —
 * which keeps these assertions about the SESSION and nothing else. Chromium resolves
 * `*.localhost` to loopback per RFC 6761, the same convention ADR-0012 relies on for
 * dev. This is load-bearing, not cosmetic: the demo account holds memberships in more
 * than one gym, and on a bare `localhost` the DAL's oldest-membership fallback serves a
 * DIFFERENT gym's agenda. Override with `E2E_HOST` only if your resolver disagrees.
 */
const PORT = Number(process.env.E2E_PORT ?? 3100);

export default defineConfig({
  testDir: "./e2e",
  // A session regression must be reproducible, never flaked away by a retry.
  retries: 0,
  // One worker: the suite signs one sandbox account in and hands that storage state
  // between tests. Parallel workers would race the same auth session.
  workers: 1,
  fullyParallel: false,
  reporter: [["list"]],
  timeout: 60_000,
  use: {
    baseURL: process.env.E2E_HOST ?? `http://red-demo-client.localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: `pnpm exec next build && pnpm exec next start --port ${PORT}`,
    // Probe the loopback literal — Node's resolver, unlike Chromium's, has no
    // `*.localhost` rule. The tests still reach this same server by tenant hostname.
    url: `http://127.0.0.1:${PORT}/entrar`,
    reuseExistingServer: false,
    // A cold `next build` of this app plus boot. Generous on purpose: a timeout here
    // would read as "the app is broken", a far worse lie than a slow run.
    timeout: 300_000,
    stdout: "pipe",
    stderr: "pipe",
  },
});
