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
