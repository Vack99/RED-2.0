#!/usr/bin/env node
// Apply one .sql file to a Supabase PREVIEW BRANCH via the Management API database/query endpoint —
// the same endpoint run-denial-suite.mjs's runSql() uses. Branch rehearsal only.
//
//   USAGE:  SUPABASE_ACCESS_TOKEN=<pat> node supabase/cutover/apply-sql.mjs <branch-project-ref> <file.sql>
//
// HARD SAFETY: refuses the LIVE parent ref (hjppxawglmukfvsgmcog). Destructive live applies happen
// ONLY at the human MCP apply_migration gates (ADR-0013 §5) — never through this script.

import { readFile } from 'node:fs/promises';

const API = 'https://api.supabase.com/v1';
const LIVE_PARENT_REF = 'hjppxawglmukfvsgmcog';

const [ref, file] = process.argv.slice(2);
const token = process.env.SUPABASE_ACCESS_TOKEN;

if (!token) { console.error('FATAL: set SUPABASE_ACCESS_TOKEN'); process.exit(2); }
if (!ref || !file) { console.error('USAGE: node supabase/cutover/apply-sql.mjs <branch-project-ref> <file.sql>'); process.exit(2); }
if (ref === LIVE_PARENT_REF) {
  console.error(`REFUSED: ${ref} is the LIVE parent. This script applies to preview branches only; live applies go through the human MCP apply_migration gate.`);
  process.exit(1);
}

const query = await readFile(file, 'utf8');
const res = await fetch(`${API}/projects/${ref}/database/query`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({ query }),
});

if (res.ok) {
  console.log(`APPLIED  ${file}  ->  ${ref}`);
  process.exitCode = 0;
} else {
  console.error(`FAILED   ${file}  ->  ${ref}\n${(await res.text()).slice(0, 600)}`);
  process.exitCode = 1;
}
