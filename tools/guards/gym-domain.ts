import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// `gym_domain` state, DERIVED from supabase/migrations/ alone (no DB, no network) — same
// posture as denial-suite.ts's RPC census and anon-read.ts's policy census. Backs
// es-principal-invariant.test.ts (shield plan (c)4, docs/superpowers/plans/2026-08-30-auth-door-shield-plan.md).
//
// COVERAGE, stated so nobody mistakes green for "every live row is checked":
// `red-demo` and `forge-demo` are LIVE gyms seeded AD HOC outside migrations — their own
// seed files say so verbatim (20260706160100:3-4, 20260710150000:3-4) — so a pure replay
// never creates those `gym` rows. Every gym_domain seed for them lives inside a
// `do $$ … end $$;` block guarded on `select id into v_gym from public.gym where
// slug = '…'` returning non-null, and inserts with the resolved `v_gym` PL/pgSQL variable
// as `gym_id`, never a slug literal — a shape this parser does not attempt to interpret (it
// only reads the `select … from (values …) as v(slug, hostname, app) join public.gym g on
// g.slug = …` shape the THREE unconditional seeds use: the tenant spine, the ibookit host
// map, and RED's custom-domain row). Those DO-block inserts are silently invisible here,
// exactly as they are to every replay-based guard in this repo (readRpcFunctions has the
// identical "DO blocks are unmodelled" limitation). This module's true coverage today is
// "forge" and "red" — the two gyms a plain top-level `insert into public.gym` creates. If a
// future migration onboards a gym slug the same unconditional way, this parser sees it like
// any other; if it lands another ad hoc-seeded gym behind a DO-block guard, it stays blind
// to that gym's rows, same as it is to red-demo/forge-demo today.
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const MIGRATIONS_DIR = join(REPO, "supabase", "migrations");

function stripSqlComments(sql: string): string {
  return sql
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

/** A literal SQL string like `'red'` -> `red`; anything else (an identifier, an
 *  expression, a bare column name pulled in by an over-eager capture) -> `null`. This is
 *  the guard against `insert … on conflict (slug) do nothing`'s `(slug)` being misread as
 *  a one-element data tuple: `slug` is never quoted, so it never survives this check. */
function unquoteLiteral(raw: string | undefined): string | null {
  if (raw === undefined) return null;
  const m = /^'(.*)'$/.exec(raw.trim());
  return m ? m[1] : null;
}

/** Split "a, b, c" on TOP-LEVEL commas (quote-aware — none of today's tuples nest a
 *  comma inside a value, but a bare `.split(",")` would still be the wrong tool). */
function splitTopLevel(s: string): string[] {
  const parts: string[] = [];
  let quoted = false;
  let current = "";
  for (const ch of s) {
    if (quoted) {
      quoted = ch !== "'";
      current += ch;
      continue;
    }
    if (ch === "'") quoted = true;
    if (ch === ",") { parts.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  if (current.trim()) parts.push(current.trim());
  return parts;
}

/** Every top-level `(…)` group in `text`, each split into its comma-separated fields.
 *  Depth/quote-aware so a value cannot prematurely close a group it is nested in — no
 *  value here nests parens, but the sibling parsers in this directory all scan this way
 *  on principle (denial-suite.ts's readArgList/splitArgs), so this does too. */
function parseValuesTuples(text: string): string[][] {
  const tuples: string[][] = [];
  let i = 0;
  while (i < text.length) {
    if (text[i] !== "(") {
      i++;
      continue;
    }
    let depth = 1;
    let quoted = false;
    let j = i + 1;
    while (j < text.length && depth > 0) {
      const ch = text[j];
      if (quoted) quoted = ch !== "'";
      else if (ch === "'") quoted = true;
      else if (ch === "(") depth++;
      else if (ch === ")") depth--;
      j++;
    }
    tuples.push(splitTopLevel(text.slice(i + 1, j - 1)));
    i = j;
  }
  return tuples;
}

export interface DomainRow {
  hostname: string;
  app: string;
  /** The gym's `slug`, standing in for `gym_id` — the replay never sees a real UUID
   *  (`gen_random_uuid()` at insert time), and `slug` identifies the same gym for
   *  every purpose this module exists for. */
  slug: string;
  esPrincipal: boolean;
}

// `insert into public.gym (slug, …) values ('forge', …), ('red', …) on conflict … ;` — the
// ONE unconditional gym-onboarding statement (20260702150000). Column order is read from
// the statement itself, not assumed, so a reordered column list still resolves correctly.
const GYM_INSERT = /insert\s+into\s+public\.gym\s*\(([^)]*)\)\s*values\s*([\s\S]*?);/gi;

// `insert into public.gym_domain (gym_id, hostname, app) select g.id, v.hostname, v.app
//  from (values ('slug', 'host', 'app'), …) as v(slug, hostname, app)
//  join public.gym g on g.slug = v.slug …;` — the three unconditional seeds (tenant spine,
// ibookit host map, RED custom-domain). The alias's own column list is read (not assumed)
// so a differently-ordered `as v(hostname, app, slug)` still resolves correctly.
const DOMAIN_SEED_INSERT =
  /insert\s+into\s+public\.gym_domain\s*\(\s*gym_id\s*,\s*hostname\s*,\s*app\s*\)\s*select\s+[a-z0-9_]+\.id\s*,[\s\S]*?from\s*\(\s*values\s*([\s\S]*?)\)\s*as\s+[a-z0-9_]+\s*\(([^)]*)\)\s*join\s+public\.gym\s+[a-z0-9_]+\s+on\s+[a-z0-9_]+\.slug\s*=\s*[a-z0-9_]+\.slug[\s\S]*?;/gi;

// `delete from public.gym_domain where hostname in ('a', 'b', …);` — the ibookit
// cutover retiring the provisional *.vercel.app rows.
const DOMAIN_DELETE = /delete\s+from\s+public\.gym_domain\s+where\s+hostname\s+in\s*\(([\s\S]*?)\)\s*;/gi;

// `update public.gym_domain d set es_principal = (d.hostname = 'host')
//  where d.gym_id = (select id from public.gym where slug = 'slug') and d.app = 'app';`
// (20260828130000) — sets the flag TRUE for the named hostname and FALSE for every other
// row in that (slug, app) group, matching real per-row UPDATE semantics.
const ES_PRINCIPAL_UPDATE =
  /update\s+public\.gym_domain\s+[a-z0-9_]+\s+set\s+es_principal\s*=\s*\(\s*[a-z0-9_]+\.hostname\s*=\s*'([^']+)'\s*\)\s+where\s+[a-z0-9_]+\.gym_id\s*=\s*\(\s*select\s+id\s+from\s+public\.gym\s+where\s+slug\s*=\s*'([^']+)'\s*\)\s+and\s+[a-z0-9_]+\.app\s*=\s*'([^']+)'\s*;/gi;

type Op = [offset: number, apply: () => void];

/**
 * The `gym_domain` table state after replaying every migration in filename order — see
 * the module header for exactly what this can and cannot see.
 *
 * Order-sensitive, same discipline as `readRpcFunctions`/`readAllPolicies`: every
 * statement in a file is queued with its source offset, the queue is sorted, THEN applied,
 * so a delete inside the same file as an insert (20260709090000 does both) fires after it,
 * never before. `gyms` and `rows` both persist across the whole file loop, not per-file —
 * a gym created in migration N is known to migration N+1's joins, matching Postgres.
 */
export function readGymDomainState(): DomainRow[] {
  const gyms = new Set<string>();
  const rows = new Map<string, DomainRow>(); // keyed by hostname (UNIQUE in the schema)

  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    const src = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    const ops: Op[] = [];
    let m: RegExpExecArray | null;

    GYM_INSERT.lastIndex = 0;
    while ((m = GYM_INSERT.exec(src)) !== null) {
      const cols = m[1].split(",").map((c) => c.trim().toLowerCase());
      const slugIdx = cols.indexOf("slug");
      if (slugIdx < 0) continue;
      const tuples = parseValuesTuples(m[2]);
      const idx = m.index;
      ops.push([
        idx,
        () => {
          for (const t of tuples) {
            const slug = unquoteLiteral(t[slugIdx]);
            if (slug) gyms.add(slug);
          }
        },
      ]);
    }

    DOMAIN_SEED_INSERT.lastIndex = 0;
    while ((m = DOMAIN_SEED_INSERT.exec(src)) !== null) {
      const [, valuesBlock, aliasCols] = m;
      const cols = aliasCols.split(",").map((c) => c.trim().toLowerCase());
      const slugIdx = cols.indexOf("slug");
      const hostIdx = cols.indexOf("hostname");
      const appIdx = cols.indexOf("app");
      if (slugIdx < 0 || hostIdx < 0 || appIdx < 0) continue;
      const tuples = parseValuesTuples(valuesBlock);
      const idx = m.index;
      ops.push([
        idx,
        () => {
          for (const t of tuples) {
            const slug = unquoteLiteral(t[slugIdx]);
            const hostname = unquoteLiteral(t[hostIdx])?.toLowerCase() ?? null;
            const app = unquoteLiteral(t[appIdx]);
            if (!slug || !hostname || !app) continue;
            if (!gyms.has(slug)) continue; // the JOIN would drop this row for real, too
            if (rows.has(hostname)) continue; // ON CONFLICT (hostname) DO NOTHING
            rows.set(hostname, { hostname, app, slug, esPrincipal: false });
          }
        },
      ]);
    }

    DOMAIN_DELETE.lastIndex = 0;
    while ((m = DOMAIN_DELETE.exec(src)) !== null) {
      const hostnames = [...m[1].matchAll(/'([^']+)'/g)].map((h) => h[1].toLowerCase());
      const idx = m.index;
      ops.push([idx, () => { for (const h of hostnames) rows.delete(h); }]);
    }

    ES_PRINCIPAL_UPDATE.lastIndex = 0;
    while ((m = ES_PRINCIPAL_UPDATE.exec(src)) !== null) {
      const [, principalHostname, slug, app] = m;
      const principal = principalHostname.toLowerCase();
      const idx = m.index;
      ops.push([
        idx,
        () => {
          for (const row of rows.values()) {
            if (row.slug === slug && row.app === app) row.esPrincipal = row.hostname === principal;
          }
        },
      ]);
    }

    ops.sort((a, b) => a[0] - b[0]);
    for (const [, apply] of ops) apply();
  }

  return [...rows.values()].sort((a, b) => a.hostname.localeCompare(b.hostname));
}

/** `localhost` and every `*.localhost` dev-mirror host — the axis the invariant guard
 *  (and the plan's (c)4 wording) explicitly excludes: dev mirrors never carry a real
 *  outbound-link decision. */
export function isLocalhost(hostname: string): boolean {
  return hostname === "localhost" || hostname.endsWith(".localhost");
}
