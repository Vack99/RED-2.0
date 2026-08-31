#!/usr/bin/env node
import pg from "pg";

// Host-provisioning probe — shield plan (c)3
// (docs/superpowers/plans/2026-08-30-auth-door-shield-plan.md).
//
// A `gym_domain` row is a hand-written migration plus 3-4 console-only companions (Auth
// redirect allow-list, Turnstile hostnames, Vercel domain attach, +/- Site URL) with ZERO
// machine guard today (FC-13) — the 2026-08-27 near-incident is this exact shape. This is
// the hard gate before treating a new host as "provisioned": it asserts, IN ORDER, that
// (1) the row itself is sane, (2) GoTrue's redirect allow-list already has the host, and
// (3) the client deploy actually serves that host's brand. It exits non-zero on the first
// failing step, naming it, so a broken provisioning job fails loud instead of shipping a
// host that mints stranded confirmation links (FC-07/FC-10's exact shape).
//
// This is a NETWORK PROBE (one live DB read, two live HTTPS calls) — it does not belong in
// tools/guards/*.test.ts, which must stay offline (pnpm test has no network and no prod
// credentials). Run it by hand, or as the provisioning job's exit test at scale.
//
//   USAGE:  SUPABASE_DB_URL=<postgres-connection-string> node tools/probe-host.mjs <hostname>
//   ENV:    SUPABASE_DB_URL   direct Postgres connection string — the same variable
//                             tools/perf/seed-local.mjs and `pnpm perf:env` use. Get it from
//                             the Supabase dashboard's Connect panel (session or transaction
//                             pooler both work; this script only ever SELECTs). [required]
//
// Step 4 (Turnstile hostname listing) is Cloudflare-dashboard-only — nothing here can read
// it — so it prints a manual-check reminder instead of asserting anything (per the plan's
// own instruction: "print a manual-check reminder instead of asserting").

const PROJECT_REF = "hjppxawglmukfvsgmcog";

/** Thrown by `fail()` so a failing step aborts the current async chain immediately —
 *  `process.exit()` does NOT stop synchronous/awaited code already in flight, so every
 *  failure path here throws instead of relying on the exit call alone. */
class ProbeFailure extends Error {}

function fail(step, reason) {
  console.error(`FAIL [${step}] ${reason}`);
  throw new ProbeFailure(reason);
}

// ── Step 1: the gym_domain row itself ─────────────────────────────────────────────────────
// app-scoped, lowercase, non-localhost — the three properties every other step assumes hold.
async function checkRow(host) {
  const dbUrl = process.env.SUPABASE_DB_URL;
  if (!dbUrl) fail("1/3 gym_domain row", "SUPABASE_DB_URL is not set — see the USAGE header in this file");

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  let rows;
  try {
    ({ rows } = await client.query(
      `select d.hostname, d.app, g.slug, g.brand_module_id
         from public.gym_domain d
         join public.gym g on g.id = d.gym_id
        where d.hostname = $1`,
      [host],
    ));
  } finally {
    await client.end();
  }

  if (rows.length === 0) fail("1/3 gym_domain row", `no gym_domain row for "${host}"`);
  const row = rows[0];
  if (row.app !== "admin" && row.app !== "client") {
    fail("1/3 gym_domain row", `app is "${row.app}", expected "admin" or "client"`);
  }
  if (row.hostname !== row.hostname.toLowerCase()) {
    fail("1/3 gym_domain row", `hostname is stored as "${row.hostname}", not lowercase`);
  }
  if (row.hostname === "localhost" || row.hostname.endsWith(".localhost")) {
    fail("1/3 gym_domain row", `"${row.hostname}" is a dev-mirror host, not a provisioning target`);
  }
  console.log(`PASS [1/3] gym_domain: ${row.hostname} -> gym "${row.slug}" (${row.app}, brand "${row.brand_module_id}")`);
  return row;
}

// ── Step 2: GoTrue echoes the redirect rather than clamping it (FC-10) ──────────────────────
// A bogus token is deliberate (matches the plan's own B3/B4 verify commands): the allow-list
// check runs before token validation, so this proves the ALLOW-LIST state regardless of
// whether the token is real.
async function checkGoTrueEcho(host) {
  const expected = `https://${host}/auth/confirm`;
  const verifyUrl =
    `https://${PROJECT_REF}.supabase.co/auth/v1/verify` +
    `?token=bogus&type=recovery&redirect_to=${encodeURIComponent(expected)}`;

  const res = await fetch(verifyUrl, { redirect: "manual" });
  const location = res.headers.get("location");
  if (!location) {
    fail("2/3 GoTrue redirect", `no Location header (status ${res.status}) from ${verifyUrl}`);
  }

  let landed;
  try {
    landed = new URL(location);
  } catch {
    fail("2/3 GoTrue redirect", `Location header is not a URL: "${location}"`);
  }

  if (landed.host.toLowerCase() !== host.toLowerCase() || landed.pathname !== "/auth/confirm") {
    fail(
      "2/3 GoTrue redirect",
      `GoTrue clamped the redirect to "${landed.origin}${landed.pathname}" instead of echoing ${expected} — ` +
        `add "https://${host}/**" to Auth -> URL Configuration -> Redirect URLs (plan B4)`,
    );
  }
  console.log(`PASS [2/3] GoTrue echoes ${expected}`);
}

// ── Step 3: the client deploy actually serves this host, under the right brand ─────────────
async function checkServedPage(host, expectedBrand) {
  const url = `https://${host}/entrar`;
  const res = await fetch(url);
  if (res.status !== 200) fail("3/3 served page", `GET ${url} returned ${res.status}, expected 200`);

  const body = await res.text();
  const marker = `data-brand="${expectedBrand}"`;
  if (!body.includes(marker)) {
    const found = /data-brand="([^"]*)"/.exec(body)?.[1] ?? "(none found)";
    fail("3/3 served page", `expected ${marker} on <html>, found data-brand="${found}"`);
  }
  console.log(`PASS [3/3] ${url} -> 200, data-brand="${expectedBrand}"`);
}

async function main() {
  const host = process.argv[2];
  if (!host) {
    console.error("usage: node tools/probe-host.mjs <hostname>");
    process.exitCode = 2;
    return;
  }

  try {
    const row = await checkRow(host);
    await checkGoTrueEcho(host);
    await checkServedPage(host, row.brand_module_id);
  } catch (err) {
    if (!(err instanceof ProbeFailure)) console.error(err);
    process.exitCode = 1;
    return;
  }

  console.log(
    `\nMANUAL CHECK — Turnstile hostname listing is Cloudflare-dashboard-only, unreachable from here:\n` +
      `  confirm "${host}" is listed among the widget's allowed hostnames (never a bare registrable\n` +
      `  domain — suffix matching silently widens the grant, plan B11) before calling this host provisioned.`,
  );
  console.log(`\n${host}: all automatable checks PASS`);
}

await main();
