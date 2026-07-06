#!/usr/bin/env node
// One-command RLS denial-suite runner (audit finding 6) — slice #21.
//
// Provisions OR reuses a seeded Supabase preview branch and runs the whole cross-tenant denial suite
// against it; the process exit code reflects pass/fail (0 = every vector denied, 1 = any leak or error).
// This is the repeatable machine gate ADR-0013 §5 requires — run green BEFORE and AFTER every policy
// migration. It talks to the Supabase Management API's `database/query` endpoint (the same endpoint the
// Supabase MCP execute_sql uses), so no psql, no Supabase CLI, and no direct DB password are needed.
//
// Each suite file is self-asserting (RAISEs on failure, wrapped in BEGIN/ROLLBACK) and seeds its own
// transaction-local fixtures with zero prod UUIDs — so the branch is reused across runs with no reset.
//
//   USAGE:  SUPABASE_ACCESS_TOKEN=<pat> SUPABASE_PROJECT_REF=<parent-ref> node supabase/tests/run-denial-suite.mjs
//   ENV:    SUPABASE_ACCESS_TOKEN  personal access token (Management API)   [required]
//           SUPABASE_PROJECT_REF   the PARENT project ref to branch from    [required]
//   (or:    pnpm test:denial  — same thing, wired in package.json)

import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const API = 'https://api.supabase.com/v1';
const BRANCH = 'denial-suite';
const HERE = dirname(fileURLToPath(import.meta.url));

// Run order: the seeded cross-tenant vectors, then the S0 (gym/gym_domain anon-read) and S1
// (gym_membership) table vectors, then the S5 per-gym folio + gym-scoped re-key vectors (#24),
// then the S8 member self-register + verified-email claim vectors.
// A future slice adds a vector to a file here — not a second harness.
const SUITE = [
  'rls_cross_tenant_denial.sql',
  'gym_tenant_anon_read.sql',
  'gym_membership_rls.sql',
  'folio_per_gym.sql',
  'rekey_gym_scoped.sql',
  'registro_claim.sql',
  'contract_a_denials.sql',
  'contract_b_denials.sql',
  'catalog_rls_denial.sql',
  'scheduling_rls_denial.sql',
  'scheduling_materialization.sql',
  'gym_content_denial.sql',
];

const token = process.env.SUPABASE_ACCESS_TOKEN;
const parentRef = process.env.SUPABASE_PROJECT_REF;
// Rehearsal override: run directly against a fixed target ref (a throwaway free project) instead of
// provisioning a preview branch — preview branching is paywalled (402). Refuses the live parent ref.
const targetRef = process.env.SUPABASE_TARGET_REF;
const LIVE_PARENT_REF = 'hjppxawglmukfvsgmcog';
if (!token || (!parentRef && !targetRef)) {
  console.error('FATAL: set SUPABASE_ACCESS_TOKEN and either SUPABASE_PROJECT_REF or SUPABASE_TARGET_REF');
  process.exit(2);
}
if (targetRef && (targetRef === parentRef || targetRef === LIVE_PARENT_REF)) {
  console.error(`REFUSED: SUPABASE_TARGET_REF (${targetRef}) must not be the live parent or SUPABASE_PROJECT_REF`);
  process.exit(2);
}

const auth = { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function api(method, path, body) {
  return fetch(`${API}${path}`, { method, headers: auth, body: body && JSON.stringify(body) });
}

// Run one SQL string on a branch's database. Resolves { ok, detail } — ok=false on any non-2xx (a fired
// RAISE surfaces as a 400/500 with the assertion message), so a leak fails the run.
async function runSql(ref, query) {
  const res = await api('POST', `/projects/${ref}/database/query`, { query });
  if (res.ok) return { ok: true };
  return { ok: false, detail: (await res.text()).slice(0, 600) };
}

// Find the branch by name, else create it (which applies all migrations to a fresh branch DB), then
// wait until its database answers a trivial query. Returns the branch's project ref.
async function ensureBranch() {
  const list = await api('GET', `/projects/${parentRef}/branches`);
  if (!list.ok) throw new Error(`list branches failed: ${list.status} ${await list.text()}`);
  let branch = (await list.json()).find((b) => b.name === BRANCH);

  if (!branch) {
    console.log(`Creating preview branch "${BRANCH}"…`);
    const made = await api('POST', `/projects/${parentRef}/branches`, { branch_name: BRANCH });
    if (!made.ok) throw new Error(`create branch failed: ${made.status} ${await made.text()}`);
    branch = await made.json();
  } else {
    console.log(`Reusing preview branch "${BRANCH}" (${branch.project_ref}).`);
  }

  const ref = branch.project_ref;
  for (let i = 0; i < 60; i++) {
    if ((await runSql(ref, 'select 1')).ok) return ref;
    await sleep(5000);
  }
  throw new Error(`branch ${ref} did not become queryable in time`);
}

try {
  const ref = targetRef ?? (await ensureBranch());
  if (targetRef) console.log(`Using target ref "${targetRef}" directly (SUPABASE_TARGET_REF override; branch path skipped).`);
  let failed = 0;
  for (const file of SUITE) {
    const sql = await readFile(join(HERE, file), 'utf8');
    const { ok, detail } = await runSql(ref, sql);
    if (ok) {
      console.log(`  PASS  ${file}`);
    } else {
      failed++;
      console.error(`  FAIL  ${file}\n${detail}`);
    }
  }
  console.log(failed ? `\nDENIAL SUITE: ${failed}/${SUITE.length} file(s) FAILED` : `\nDENIAL SUITE: all ${SUITE.length} files green`);
  process.exitCode = failed ? 1 : 0;
} catch (err) {
  console.error(`FATAL: ${err.message}`);
  process.exitCode = 1;
}
// Set exitCode + let the loop drain rather than process.exit(): a synchronous exit races undici's
// socket teardown and aborts the process with a libuv assertion on some platforms.
