import { mkdirSync, writeFileSync, readdirSync, readFileSync } from "node:fs";
import { cpus } from "node:os";
import path from "node:path";

import {
  CONDITIONS_ID,
  DB_MODE,
  GATE_METRIC,
  GATE_MS,
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

  if (prev && prev.conditions === CONDITIONS_ID) diff(prev, run);
  else if (prev) console.log("  (conditions changed — not comparable to the previous run)\n");

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
