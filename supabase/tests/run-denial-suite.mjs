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
import { fileURLToPath, pathToFileURL } from 'node:url';
import { dirname, join } from 'node:path';

const API = 'https://api.supabase.com/v1';
const BRANCH = 'denial-suite';
const HERE = dirname(fileURLToPath(import.meta.url));

// Run order: the seeded cross-tenant vectors, then the S0 (gym/gym_domain anon-read) and S1
// (gym_membership) table vectors, then the S5 per-gym folio + gym-scoped re-key vectors (#24),
// then the S8 member self-register + verified-email claim vectors (registro_claim →
// preparar_invitacion → actualizar_cliente_email → reclamar_por_codigo, the whole claim rail),
// then the SECURITY DEFINER money-path write rail (registrar_venta gym-stamp + email arm), the
// per-package RLS/RPC-rule vectors, and finally gym2_probe — the end-to-end second-gym capstone.
// Each file is a self-contained BEGIN…ROLLBACK, so run order is documentation, not a dependency.
// A future slice adds a vector to a file here — not a second harness. Two guards in the normal
// `pnpm test` gate keep this wiring honest (#80): denial-suite-drift.test.ts fails on a .sql that is
// in neither SUITE nor QUARANTINE, and rpc-write-coverage.test.ts fails when a write-bearing RPC
// (derived from the migrations, not declared) is absent from supabase/tests/rpc-coverage.json.
export const SUITE = [
  'rls_cross_tenant_denial.sql',
  'gym_tenant_anon_read.sql',
  'gym_membership_rls.sql',
  'folio_per_gym.sql',
  'rekey_gym_scoped.sql',
  'registro_claim.sql',
  'preparar_invitacion_rules.sql',
  'actualizar_cliente_email_rules.sql',
  'actualizar_cliente_rules.sql',
  'reclamar_por_codigo.sql',
  'registrar_venta_stamps_gym_id.sql',
  'registrar_venta_email.sql',
  'registrar_venta_stacking.sql',
  'renewal_schema_prep.sql',
  'contract_a_denials.sql',
  'contract_b_denials.sql',
  'catalog_rls_denial.sql',
  'paquete_marketing_rules.sql',
  'actualizar_paquete_rules.sql',
  'plantillas_rules.sql',
  'scheduling_rls_denial.sql',
  'scheduling_materialization.sql',
  'gym_content_denial.sql',
  'anon_catalog_read.sql',
  'contact_intake.sql',
  'reservation_rls_denial.sql',
  'reservar_clase_rules.sql',
  'cancelar_reserva_rules.sql',
  'pasar_lista_sesion_rules.sql',
  'toggle_pase_rules.sql',
  'toggle_pase_gym2_timezone.sql',
  'favorito_rules.sql',
  'roster_clase_rules.sql',
  'mi_membresia_rules.sql',
  'gym2_probe.sql',
];

// QUARANTINE — suite files that exist on disk but must NOT run yet, each with a stated reason
// (satisfies #80 AC "run OR deleted with a stated reason; nothing sits on disk pretending to be a
// test"). Empty since #81: the last three pre-Contract-B files (actualizar_cliente_rules,
// actualizar_paquete_rules, plantillas_rules) were rewritten to the per-gym written-row idiom and
// moved into SUITE (toggle_pase_rules + toggle_pase_gym2_timezone earlier, alongside 20260710124000).
// Kept as the drift guard's landing slot: a NEW suite file must enter SUITE or here with a reason.
export const QUARANTINE = [];

const token = process.env.SUPABASE_ACCESS_TOKEN;
const parentRef = process.env.SUPABASE_PROJECT_REF;
// Rehearsal override: run directly against a fixed target ref (a throwaway free project) instead of
// provisioning a preview branch — preview branching is paywalled (402). Refuses the live parent ref.
const targetRef = process.env.SUPABASE_TARGET_REF;
const LIVE_PARENT_REF = 'hjppxawglmukfvsgmcog';

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

// Only runs when invoked as a script (pnpm test:denial). Importing this module — the drift guard
// does, to read SUITE/QUARANTINE — must have no side effects, so the env validation + run loop live
// here, gated below, not at top level.
async function main() {
  if (!token || (!parentRef && !targetRef)) {
    console.error('FATAL: set SUPABASE_ACCESS_TOKEN and either SUPABASE_PROJECT_REF or SUPABASE_TARGET_REF');
    process.exit(2);
  }
  if (targetRef && (targetRef === parentRef || targetRef === LIVE_PARENT_REF)) {
    console.error(`REFUSED: SUPABASE_TARGET_REF (${targetRef}) must not be the live parent or SUPABASE_PROJECT_REF`);
    process.exit(2);
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
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
