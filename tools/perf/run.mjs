import { mkdirSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { cpus } from "node:os";
import path from "node:path";

import {
  CONDITIONS_ID,
  DB_MODE,
  GATE_METRIC,
  GATE_MS,
  GYM_BRAND_NAME,
  GYM_SLUG,
  PORTS,
  SAMPLES,
  WARMUP,
  pointAtLocalDatabase,
  routesInScope,
} from "./config.mjs";
import { launchBrowser, login, measureLcp } from "./lib/browser.mjs";
import { build, startServers, stopServers } from "./lib/servers.mjs";
import { closeAgent, summarize, timeRequest } from "./lib/timing.mjs";

const RESULTS_DIR = path.join("tools", "perf", "results");
const label = process.argv[2] ?? "run";
const skipBuild = process.argv.includes("--no-build");

/**
 * Refuse to measure a database the app cannot actually read.
 *
 * The status code is not enough to tell a healthy page from a hollow one. When the tenant
 * fails to resolve, `resolveTenant` returns null, no `x-gym` header is stamped, and every
 * page renders its "no gym" fallback — while still answering **200**, and fast, because it
 * touched no data. An entire 19-route baseline once came back at ~10ms/route that way (a
 * missing local table grant), and looked like a spectacular result.
 *
 * So: prove the seeded tenant renders before timing anything. Local only — `PERF_DB=live`
 * points at a real project whose brand name is not ours to assert on.
 */
async function assertTenantResolves() {
  const res = await fetch(`http://127.0.0.1:${PORTS.client}/?gym=${GYM_SLUG}`);
  const html = await res.text();

  if (!html.includes(GYM_BRAND_NAME)) {
    throw new Error(
      `PREFLIGHT FAILED: the client home answered ${res.status} but does not render the seeded ` +
        `gym ("${GYM_BRAND_NAME}").\n` +
        `  The tenant is not resolving, so every route would render an empty state and every\n` +
        `  number in this run would be a lie. Almost always: the database was reset without\n` +
        `  re-seeding. Fix with:  pnpm perf:seed`,
    );
  }
}

/**
 * One measurement pass over every route in scope, under the conditions frozen in
 * config.mjs. Writes a JSON result, prints a table against the 50ms gate, and diffs
 * against the previous run so the loop can see whether the last change actually moved
 * anything.
 */
async function main() {
  // MUST precede the build: NEXT_PUBLIC_* is inlined into the bundle at build time.
  if (DB_MODE === "local") pointAtLocalDatabase();

  const routes = routesInScope();
  console.log(
    `\nperf run "${label}" — ${routes.length} routes, db=${DB_MODE}, gate=${GATE_METRIC} < ${GATE_MS}ms, conditions=${CONDITIONS_ID}\n`,
  );

  if (!skipBuild) {
    console.log("building (production)...\n");
    await build();
  }

  const servers = await startServers();
  const browser = await launchBrowser();
  const results = [];

  try {
    if (DB_MODE === "local") await assertTenantResolves();

    const needsAuth = routes.some((r) => r.auth);
    const session = needsAuth ? await login(browser) : { cookieHeader: "", cookies: [] };
    if (needsAuth) console.log("logged in; reusing session for all authed routes\n");

    for (const route of routes) {
      const port = PORTS[route.app];
      const url = `${route.path}${route.path.includes("?") ? "&" : "?"}gym=${GYM_SLUG}`;
      const cookie = route.auth ? session.cookieHeader : "";

      for (let i = 0; i < WARMUP; i++) await timeRequest(port, url, cookie);

      const samples = [];
      for (let i = 0; i < SAMPLES; i++) samples.push(await timeRequest(port, url, cookie));
      const timing = summarize(samples);

      // A route that redirected or errored is not a fast route — it is a broken one.
      // Flag it loudly rather than letting a 3ms /login redirect masquerade as a win.
      const broken = timing.status >= 300;
      const lcp = broken
        ? null
        : await measureLcp(browser, port, url, route.auth ? session.cookies : []);

      results.push({ ...route, ...timing, lcp, broken });
      report(results.at(-1));
    }
  } finally {
    await browser.close();
    closeAgent();
    stopServers(servers);
  }

  persist(results);
}

function report(r) {
  const value = r[GATE_METRIC].p50;
  const mark = r.broken ? "BROKEN" : value < GATE_MS ? "PASS  " : "FAIL  ";
  const status = r.broken ? ` <- HTTP ${r.status}${r.location ? ` -> ${r.location}` : ""}` : "";
  console.log(
    `  ${mark} ${String(value).padStart(7)}ms  ` +
      `(ttfb ${String(r.ttfb.p50).padStart(6)}ms, p95 ${String(r[GATE_METRIC].p95).padStart(6)}ms, ` +
      `lcp ${r.lcp === null ? "    n/a" : `${String(r.lcp).padStart(5)}ms`}, ${(r.bytes / 1024).toFixed(0).padStart(3)}KB)  ` +
      `${r.app}${r.path}${status}`,
  );
}

function persist(results) {
  mkdirSync(RESULTS_DIR, { recursive: true });

  const live = results.filter((r) => !r.broken);
  const passing = live.filter((r) => r[GATE_METRIC].p50 < GATE_MS).length;
  const run = {
    label,
    conditions: CONDITIONS_ID,
    db: DB_MODE,
    gate: { metric: GATE_METRIC, ms: GATE_MS },
    machine: { cpus: cpus().length, node: process.version, platform: process.platform },
    passing,
    total: results.length,
    broken: results.filter((r) => r.broken).length,
    worst: live.length
      ? Math.max(...live.map((r) => r[GATE_METRIC].p50))
      : null,
    routes: results,
  };

  const prev = previousRun();
  const file = path.join(RESULTS_DIR, `${String(runCount()).padStart(3, "0")}-${label}.json`);
  writeFileSync(file, JSON.stringify(run, null, 2));

  console.log(
    `\n  ${passing}/${results.length} routes under ${GATE_MS}ms` +
      (run.broken ? `  (${run.broken} BROKEN — fix before trusting this run)` : "") +
      `\n  worst route: ${run.worst}ms\n`,
  );

  if (prev && prev.conditions === CONDITIONS_ID) {
    diff(prev, run);
    ratchet(prev, run);
  } else if (prev) console.log("  (conditions changed — not comparable to the previous run)\n");

  console.log(`  written: ${file}\n`);
}

/** Per-route delta vs the previous run. This is what tells the loop if a change worked. */
function diff(prev, run) {
  const before = new Map(prev.routes.map((r) => [`${r.app}${r.path}`, r[GATE_METRIC].p50]));
  const moved = run.routes
    .map((r) => {
      const key = `${r.app}${r.path}`;
      const was = before.get(key);
      return was == null ? null : { key, was, now: r[GATE_METRIC].p50, delta: r[GATE_METRIC].p50 - was };
    })
    .filter((d) => d && Math.abs(d.delta) >= 2) // below ~2ms is noise, not signal
    .sort((a, b) => a.delta - b.delta);

  if (!moved.length) return console.log(`  vs ${prev.label}: no route moved by >2ms\n`);
  console.log(`  vs ${prev.label}:`);
  for (const d of moved) {
    const sign = d.delta < 0 ? "" : "+";
    console.log(`    ${sign}${d.delta.toFixed(1)}ms  ${d.was} -> ${d.now}   ${d.key}`);
  }
  console.log("");
}

/**
 * Ratchet the metrics we RECORD but do not gate — LCP and bytes — against the previous run.
 *
 * The gate is on `html` because it is the low-noise server number we optimize. But `html` can
 * be "won" without making anything faster: convert an SSR data-fetch into a client-side fetch
 * and the document shrinks (html drops) while the data wait reappears in the browser (LCP
 * climbs). Gating `html` alone — even not `ttfb` — cannot see that, because the document
 * genuinely does arrive fast; it just no longer carries the data. So we watch LCP for
 * regressions here: gate what you optimize, ratchet what you actually care about.
 *
 * Bytes is a TWO-WAY integrity tripwire, not a one-directional ratchet — a page has no single
 * "good" direction for byte count. A large DROP is exactly how the empty-page bug announced
 * itself (a route that quietly stopped rendering its data while still answering 200); a large
 * RISE is unexpected in a pure-optimization loop. Either is worth a human's eye. This
 * generalizes main()'s home-page preflight to all 19 routes, per route.
 *
 * WARN-LEVEL ON PURPOSE — it prints, it does not fail the run. LCP here is 5 cold-context
 * Playwright samples and swings a lot; a hard gate on it would block the loop on jitter.
 * Characterize the noise floor over a few loop iterations first, THEN decide whether to
 * promote the LCP check to a real fail-gate.
 */
function ratchet(prev, run) {
  const before = new Map(
    prev.routes.map((r) => [`${r.app}${r.path}`, { lcp: r.lcp, bytes: r.bytes }]),
  );
  const warnings = [];

  for (const r of run.routes) {
    const was = before.get(`${r.app}${r.path}`);
    if (!was) continue;

    // LCP regression: deliberately generous (>30% AND >25ms) because LCP is noisy. Both runs
    // must have measured it (a BROKEN route records lcp=null).
    if (was.lcp != null && r.lcp != null && r.lcp > was.lcp * 1.3 && r.lcp - was.lcp > 25) {
      warnings.push(
        `LCP   +${(r.lcp - was.lcp).toFixed(0)}ms   ${was.lcp} -> ${r.lcp}   ${r.app}${r.path}`,
      );
    }

    // Bytes moved materially either way (>15% AND >1KB), which ignores per-render jitter
    // (timestamps, tokens) while still catching a page that went hollow or ballooned.
    const dBytes = r.bytes - was.bytes;
    if (was.bytes > 0 && Math.abs(dBytes) / was.bytes > 0.15 && Math.abs(dBytes) > 1024) {
      const sign = dBytes < 0 ? "" : "+";
      warnings.push(
        `bytes ${sign}${(dBytes / 1024).toFixed(1)}KB   ${(was.bytes / 1024).toFixed(0)}KB -> ` +
          `${(r.bytes / 1024).toFixed(0)}KB   ${r.app}${r.path}`,
      );
    }
  }

  if (!warnings.length) return;
  console.log("  ratchet (recorded-but-ungated metrics moved — warn only, NOT a gate failure):");
  for (const w of warnings) console.log(`    ${w}`);
  console.log("");
}

const runFiles = () => {
  try {
    return readdirSync(RESULTS_DIR).filter((f) => f.endsWith(".json")).sort();
  } catch {
    return [];
  }
};
const runCount = () => runFiles().length + 1;
const previousRun = () => {
  const files = runFiles();
  if (!files.length) return null;
  return JSON.parse(readFileSync(path.join(RESULTS_DIR, files.at(-1)), "utf8"));
};

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
