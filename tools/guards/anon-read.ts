import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// The anon-read surface, DERIVED from supabase/migrations/ alone (no DB, no network) —
// the same posture as `denial-suite.ts`'s function census, and for the same reason: a
// declared list can be wrong, a derived one cannot.
//
// Why this axis needs a guard at all (#214). `docs/health/2026-07-05-post-cutover-db-audit.md`
// certifies "I3 — Anon reads limited to `gym` + `gym_domain` only — PASS". The very next
// day `20260706160000_phase6_anon_catalog_read.sql` added 14 more `to anon using (true)`
// policies, and `20260706165900_create_gym_contact.sql` a 15th. Nothing re-ran the audit.
// The 2026-07-27 audit then restated the guarantee in a stronger form that was already
// false. Unnoticed for 27 days — a PASS with no expiry and no re-runner is a belief, not
// an invariant. Both existing guards key on WRITE RPCs; the anon-READ axis produced every
// confirmed cross-tenant read in the 2026-08-02 cross-examination and had no guard at all.
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONS_DIR = join(REPO, "supabase", "migrations");

export const ALLOWLIST = join(REPO, "supabase", "tests", "anon-read-allowlist.json");

/** Strip `--` line comments. CRLF-safe for the same reason `denial-suite.ts` is: JS `.`
 *  never matches `\r`, so `/--.*$/` silently fails to strip on a CRLF line and migration
 *  PROSE (which quotes policy DDL constantly here) survives into the parse. */
function stripSqlComments(sql: string): string {
  return sql
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

export interface AnonPolicy {
  table: string;
  policy: string;
  /** `select` | `all` | `insert` | … — absent `FOR` defaults to `ALL` in Postgres. */
  command: string;
  /** Lower-cased grantee roles. EMPTY means the policy has no `TO` clause, which in
   *  Postgres means `PUBLIC` — and PUBLIC includes `anon`. That default is the quietest
   *  way a table becomes anon-readable, so it is treated as anon here, not skipped. */
  roles: string[];
  /** The `USING (…)` predicate, whitespace-collapsed. `true` is the enumerable case. */
  using: string;
}

// `create policy "name" on public.table for select to anon, authenticated using (true);`
// The tail is captured to the statement's `;` — no policy predicate in this repo contains
// one, and policies have no dollar-quoted body to confuse the scan (unlike functions).
const CREATE =
  /create\s+policy\s+(?:"([^"]+)"|([a-z0-9_]+))\s+on\s+(?:public\.)?([a-z0-9_]+)([\s\S]*?);/gi;
const DROP =
  /drop\s+policy\s+(?:if\s+exists\s+)?(?:"([^"]+)"|([a-z0-9_]+))\s+on\s+(?:public\.)?([a-z0-9_]+)/gi;
// A table dropped outright takes its policies with it.
const DROP_TABLE = /drop\s+table\s+(?:if\s+exists\s+)?(?:public\.)?([a-z0-9_]+)/gi;

const collapse = (s: string): string => s.replace(/\s+/g, " ").trim();

function parseTail(tail: string): Pick<AnonPolicy, "command" | "roles" | "using"> {
  const command = /\bfor\s+(all|select|insert|update|delete)\b/i.exec(tail)?.[1].toLowerCase() ?? "all";
  const toClause = /\bto\s+([a-z0-9_,\s]*?)\s*(?:\busing\b|\bwith\s+check\b|$)/i.exec(tail)?.[1];
  const roles = toClause
    ? toClause
        .split(",")
        .map((r) => r.trim().toLowerCase())
        .filter(Boolean)
    : [];
  // Balanced-paren scan from `using (`: a predicate like ((select is_member_of(gym_id)))
  // nests, so a lazy `\((.*?)\)` would stop at the first inner close.
  const start = /\busing\s*\(/i.exec(tail);
  let using = "";
  if (start) {
    let depth = 0;
    const from = start.index + start[0].length - 1;
    for (let i = from; i < tail.length; i++) {
      if (tail[i] === "(") depth++;
      else if (tail[i] === ")") {
        depth--;
        if (depth === 0) {
          using = collapse(tail.slice(from + 1, i));
          break;
        }
      }
    }
  }
  return { command, roles, using };
}

/**
 * Every policy surviving a replay of the migrations that lets the `anon` role SELECT.
 *
 * Order-sensitive and last-write-wins, keyed on `table.policy`: migrations replay in
 * filename order and, within a file, in source order — every one of these policies is
 * written `drop policy if exists` immediately followed by `create policy`, so a
 * set-difference would report all of them absent.
 *
 * GRANTS are deliberately not modelled. Supabase's baseline grants SELECT on every
 * `public` table to `anon`, so the policy IS the decision in all but the two tables
 * that carry an explicit column grant (`gym`, and `gym_domain` after #216) — and there
 * a narrowed grant still leaves the table anon-readable, just not enumerable in full.
 * Over-reporting costs an allow-file line; under-reporting is how #215/#216 survived
 * 27 days, so the guard errs toward reporting.
 */
export function readAllPolicies(): AnonPolicy[] {
  const present = new Map<string, AnonPolicy>();

  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    const src = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    const ops: Array<[number, () => void]> = [];
    let m: RegExpExecArray | null;

    CREATE.lastIndex = 0;
    while ((m = CREATE.exec(src)) !== null) {
      const [, quoted, bare, table, tail] = m;
      const policy = (quoted ?? bare).toLowerCase();
      const key = `${table.toLowerCase()}.${policy}`;
      const parsed = parseTail(tail);
      ops.push([m.index, () => present.set(key, { table: table.toLowerCase(), policy, ...parsed })]);
    }
    DROP.lastIndex = 0;
    while ((m = DROP.exec(src)) !== null) {
      const [, quoted, bare, table] = m;
      const key = `${table.toLowerCase()}.${(quoted ?? bare).toLowerCase()}`;
      ops.push([m.index, () => present.delete(key)]);
    }
    DROP_TABLE.lastIndex = 0;
    while ((m = DROP_TABLE.exec(src)) !== null) {
      const table = m[1].toLowerCase();
      ops.push([
        m.index,
        () => {
          for (const key of [...present.keys()]) if (key.startsWith(`${table}.`)) present.delete(key);
        },
      ]);
    }

    ops.sort((a, b) => a[0] - b[0]);
    for (const [, apply] of ops) apply();
  }

  return [...present.values()].sort(
    (a, b) => a.table.localeCompare(b.table) || a.policy.localeCompare(b.policy),
  );
}

/** The anon-readable subset: a SELECT-or-ALL policy whose grantees include `anon`, or
 *  which names no grantee at all (Postgres defaults that to PUBLIC, and PUBLIC includes
 *  anon — the quietest way a table joins this list). */
export function readAnonReadPolicies(): AnonPolicy[] {
  return readAllPolicies()
    .filter((p) => p.command === "select" || p.command === "all")
    .filter((p) => p.roles.length === 0 || p.roles.includes("anon"));
}

/** `all-gyms` = the predicate is literally `true`, so ONE anonymous call returns every
 *  tenant's rows. `scoped` = the predicate narrows. This is the distinction #215/#216
 *  exist to change, so the allow-file records it and the guard pins it: a scoped policy
 *  silently widening back to `using (true)` fails the build exactly like a new table. */
export function scopeOf(p: AnonPolicy): "all-gyms" | "scoped" {
  return p.using.toLowerCase() === "true" ? "all-gyms" : "scoped";
}

export interface AllowEntry {
  scope: "all-gyms" | "scoped";
  reason: string;
}

export function readAllowlist(): Record<string, AllowEntry> {
  return (JSON.parse(readFileSync(ALLOWLIST, "utf8")) as { anonReadable: Record<string, AllowEntry> })
    .anonReadable;
}
