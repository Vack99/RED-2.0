import { readFileSync } from "node:fs";

/**
 * The single source of truth for what "the same repeatable test conditions" means.
 *
 * Every knob that could make two runs incomparable lives HERE, and nowhere else.
 * If you change anything in this file, previous results are no longer comparable —
 * bump CONDITIONS_ID so the report refuses to diff across the change.
 */

/** Bump on ANY change to the measurement conditions below. Runs with different ids never diff. */
export const CONDITIONS_ID = "c1";

/** The gate. Every route must land under this, measured as `html` (see METRICS). */
export const GATE_MS = 50;

/**
 * Which metric the gate is applied to.
 *
 * `html` — wall time until the LAST byte of the HTML document arrives.
 *
 * NOT `ttfb`: Next streams SSR, so the first byte can arrive in ~5ms while the page
 * is still blocked on the database. Gating on `ttfb` would let us "win" by streaming
 * an empty shell sooner. `html` is the honest server-side page-load number and cannot
 * be gamed that way. `ttfb` and `lcp` are still recorded every run, just not gated.
 */
export const GATE_METRIC = "html";

/** Fixed ports: same ports every run, so nothing is attributable to port/proc churn. */
export const PORTS = { client: 3100, admin: 3200 };

/** Discarded requests that pay the one-time module-load / JIT cost before we time anything. */
export const WARMUP = 5;
/** Timed samples per route. We report the median (p50) and p95, never the mean. */
export const SAMPLES = 20;
/** Playwright LCP runs per route (each is a cold browser context, so these are slow). */
export const LCP_SAMPLES = 5;

/**
 * The tenant every request resolves to. Passed as `?gym=` on EVERY request rather
 * than relying on the `gym` cookie the proxy sets, so that request #1 and request #20
 * travel an identical code path.
 */
export const GYM_SLUG = "forge-demo";

/**
 * Deterministic fixture ids for the dynamic routes. These uuids are literals in
 * supabase/seed.perf.sql — the seed and the route table MUST agree, which is why
 * they are declared once, here.
 */
export const FIXTURES = {
  clienteId: "11111111-1111-4111-8111-111111111111",
  sessionId: "22222222-2222-4222-8222-222222222222",
};

/** The seeded admin operator. Only ever exists in the LOCAL database (see seed.perf.sql). */
export const ADMIN_USER = { email: "perf@local.test", password: "perf-local-password" };

/**
 * All 19 routes.
 *
 * `auth`   — needs a logged-in session; the harness logs in once and reuses the cookies.
 * `public` — measurable against the live DB too (no session, no seeded fixture required).
 */
export const ROUTES = [
  // ---- client app (member-facing) ----
  { app: "client", path: "/", auth: false, public: true },
  { app: "client", path: "/precios", auth: false, public: true },
  { app: "client", path: "/nosotros", auth: false, public: true },
  { app: "client", path: "/contacto", auth: false, public: true },
  { app: "client", path: "/legal", auth: false, public: true },
  { app: "client", path: "/entrar", auth: false, public: true },
  { app: "client", path: "/registro", auth: false, public: true },
  { app: "client", path: "/restablecer", auth: false, public: true },
  { app: "client", path: "/reservar", auth: true, public: false },
  { app: "client", path: `/clase/${FIXTURES.sessionId}`, auth: true, public: false },
  { app: "client", path: `/confirmada/${FIXTURES.sessionId}`, auth: true, public: false },

  // ---- admin app (staff-facing) ----
  { app: "admin", path: "/login", auth: false, public: true },
  { app: "admin", path: "/inicio", auth: true, public: false },
  { app: "admin", path: "/clientes", auth: true, public: false },
  { app: "admin", path: `/clientes/${FIXTURES.clienteId}`, auth: true, public: false },
  { app: "admin", path: "/vender", auth: true, public: false },
  { app: "admin", path: "/agenda", auth: true, public: false },
  { app: "admin", path: "/asistencia", auth: true, public: false },
  { app: "admin", path: "/cuenta", auth: true, public: false },
];

/**
 * `local` — Supabase on localhost (Docker). All 19 routes. The only mode in which
 *           the 50ms gate is physically reachable: a query costs ~1-3ms.
 * `live`   — the real remote project. PUBLIC routes only (we never write a perf user
 *           to production). A single query costs ~50-150ms, so the gate is expected
 *           to fail here; this mode exists to sanity-check the harness and to watch
 *           the DB round-trip COUNT come down.
 */
export const DB_MODE = process.env.PERF_DB === "live" ? "live" : "local";

export const routesInScope = () =>
  DB_MODE === "live" ? ROUTES.filter((r) => r.public) : ROUTES;

/**
 * Point the apps at the LOCAL Supabase.
 *
 * This has to happen before the BUILD, not just before `next start`: Next inlines every
 * `NEXT_PUBLIC_*` value into the client bundle at build time, so a build done against the
 * remote project keeps talking to the remote project no matter what the server env says at
 * runtime. Overriding process.env here (run.mjs calls this first) means the build and both
 * servers, which inherit it, all agree.
 *
 * `.env.local-db` is generated by `pnpm perf:env` from `supabase status` — it is not secret
 * (local Supabase keys are fixed demo keys) but it is machine-local, so it is not committed.
 */
export function pointAtLocalDatabase() {
  const file = "tools/perf/.env.local-db";
  let raw;
  try {
    raw = readFileSync(file, "utf8");
  } catch {
    throw new Error(
      `PERF_DB=local but ${file} is missing.\n` +
        `  Start the local stack and capture its env:  supabase start && pnpm perf:env`,
    );
  }

  for (const line of raw.split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*"?(.*?)"?\s*$/);
    if (match) process.env[match[1]] = match[2];
  }

  if (!process.env.NEXT_PUBLIC_SUPABASE_URL?.includes("127.0.0.1")) {
    throw new Error(
      "PERF_DB=local but NEXT_PUBLIC_SUPABASE_URL does not point at localhost — " +
        "refusing to run, this would measure (and seed) the REMOTE project.",
    );
  }
}
