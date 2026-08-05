import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Shared readers for the two denial-suite shields: `denial-suite-drift.test.ts`
// (every .sql is wired) and `rpc-write-coverage.test.ts` (every write-bearing RPC
// is covered). Both need the runner's wiring arrays, and the coverage guard also
// needs the migration-derived function census, so the parsing lives once here.
//
// We parse SOURCE rather than importing the runner: the guard then has zero
// coupling to that module's runtime/env/type setup and cannot be broken by it.
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

export const TESTS_DIR = join(REPO, "supabase", "tests");
const MIGRATIONS_DIR = join(REPO, "supabase", "migrations");
const RUNNER = join(TESTS_DIR, "run-denial-suite.mjs");

/**
 * Strip `--` line comments.
 *
 * CRLF-safe by construction: JavaScript's `.` never matches `\r` (a line
 * terminator), so `/--.*$/` silently FAILS to strip a comment on a CRLF line and
 * the prose survives into the parse. Splitting on `/\r?\n/` first drops the `\r`.
 * Without this, migration prose like "(CREATE FUNCTION grants EXECUTE to public
 * by default)" is read as a real `create function grants` definition.
 */
function stripSqlComments(sql: string): string {
  return sql
    .split(/\r?\n/)
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

function parseArray(source: string, name: string): string[] {
  const block = source.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\];`));
  if (!block) throw new Error(`could not locate the ${name} array in run-denial-suite.mjs`);
  return [...block[1].matchAll(/'([^']+\.sql)'/g)].map((m) => m[1]);
}

/** The runner's two wiring arrays: files that RUN, and files knowingly parked. */
export function readWiring(): { suite: string[]; quarantine: string[] } {
  const source = readFileSync(RUNNER, "utf8");
  return { suite: parseArray(source, "SUITE"), quarantine: parseArray(source, "QUARANTINE") };
}

export function suiteFilesOnDisk(): string[] {
  return readdirSync(TESTS_DIR).filter((f) => f.endsWith(".sql"));
}

/**
 * Does `suiteFile` actually call `fn`? Guards the map against naming a suite that never invokes it.
 * `\b${fn}\s*\(` matches both `fn(` and `public.fn(` (the `.` is a `\b`). Comments are stripped but
 * string literals are not, so a `raise exception '… fn(…)'` would false-credit; none exists today.
 */
export function suiteInvokes(suiteFile: string, fn: string): boolean {
  const body = stripSqlComments(readFileSync(join(TESTS_DIR, suiteFile), "utf8"));
  return new RegExp(`\\b${fn}\\s*\\(`, "i").test(body);
}

type RpcFunction = { name: string; writes: boolean };

// A `create [or replace] function public.NAME (...) ... $tag$ BODY $tag$` definition. The body's
// opening dollar-tag is captured and back-referenced, because the migrations use four different
// tags ($function$, $body$, $$, $md$) and a fixed `\$\$` would miss most definitions.
const DEFINITION =
  /create\s+(?:or\s+replace\s+)?function\s+(?:public\.)?([a-z0-9_]+)\s*\([\s\S]*?(\$[a-z_]*\$)([\s\S]*?)\2/gi;
const DROP = /drop\s+function\s+(?:if\s+exists\s+)?(?:public\.)?([a-z0-9_]+)/gi;
// A body "writes" if it INSERTs/DELETEs/MERGEs or UPDATEs. The UPDATE arm tolerates an optional
// `[as] alias` between table and `set` so `update t x set …` isn't misread as a non-writer — the one
// silent-exemption path that would let a writer classify as a reader and slip the coverage guard.
// TRANSITIVE writers count too (see propagateWrites): an RPC whose body has no direct DML but calls
// one that does is still a write path, and #136 made that shape load-bearing rather than theoretical.
const WRITES = /\b(?:insert\s+into|delete\s+from|merge\s+into)\b/i;
const WRITES_UPDATE = /\bupdate\b\s+\S+(?:\s+(?:as\s+)?\S+)?\s+set\b/i;

function bodyWrites(body: string): boolean {
  return WRITES.test(body) || WRITES_UPDATE.test(body);
}

/**
 * Close the writer set over CALLS, to a fixpoint.
 *
 * #136 split the materialization rule into one shared core (`materialize_week_for_gym`, direct DML)
 * behind two callers that hold none: `ensure_week_materialized` — a write RPC since #42, and in this
 * map since #80 — became a thin wrapper, and `cron_materialize_horizon` writes the whole fleet's
 * sessions without a single `insert` of its own. Judged on direct DML alone, both would classify as
 * pure readers: the first would be EJECTED from rpc-coverage.json by the no-pure-reader test and the
 * second BARRED from entering it, which is the coverage guard congratulating itself for exempting the
 * two functions that write the most rows. Extracting a shared core is normal refactoring; it must not
 * silently dissolve a coverage obligation.
 *
 * Direction of error is deliberate: this only ever ADDS obligations (a false positive costs one map
 * line), never removes one. Matching is the same `\bname\s*\(` call-site test `suiteInvokes` uses, so
 * it sees `public.fn(…)` and bare `fn(…)` alike; string literals are not stripped, so a body that
 * merely NAMES a writer inside a `raise` message would over-report — no such body exists today.
 */
function propagateWrites(bodies: Map<string, string>, writes: Map<string, boolean>): void {
  for (let changed = true; changed; ) {
    changed = false;
    for (const [name, body] of bodies) {
      if (writes.get(name)) continue;
      for (const [callee, calleeWrites] of writes) {
        if (callee === name || !calleeWrites) continue;
        if (!new RegExp(`\\b${callee}\\s*\\(`, "i").test(body)) continue;
        writes.set(name, true);
        changed = true;
        break;
      }
    }
  }
}

/**
 * The `public` function census, derived from the migrations alone (no DB, no network).
 *
 * Order-sensitive and last-write-wins: migrations are replayed in filename order and, within a
 * file, in source order — a `drop` removes, a later `create` restores. `registrar_venta` is
 * dropped and recreated with a new signature, so a set-difference of creates-minus-drops would
 * wrongly report it absent.
 *
 * `writes` is DERIVED from the final definition's body — and then closed over calls by
 * `propagateWrites` — never declared: that is what makes the coverage guard un-dodgeable. There is
 * no hand-maintained "this one doesn't write" flag to flip.
 *
 * Verified against the live catalog (`pg_proc` where `pronamespace = 'public'`) at the time of #80:
 * exactly 34 functions, 25 writers, 9 pure readers — same names, no drift.
 */
export function readRpcFunctions(): RpcFunction[] {
  const present = new Map<string, string>(); // name -> final body

  for (const file of readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort()) {
    const src = stripSqlComments(readFileSync(join(MIGRATIONS_DIR, file), "utf8"));
    const ops: Array<[number, "create" | "drop", string, string]> = [];
    let m: RegExpExecArray | null;

    DEFINITION.lastIndex = 0;
    while ((m = DEFINITION.exec(src)) !== null) ops.push([m.index, "create", m[1].toLowerCase(), m[3]]);
    DROP.lastIndex = 0;
    while ((m = DROP.exec(src)) !== null) ops.push([m.index, "drop", m[1].toLowerCase(), ""]);

    ops.sort((a, b) => a[0] - b[0]);
    for (const [, op, name, body] of ops) {
      if (op === "create") present.set(name, body);
      else present.delete(name);
    }
  }

  const writes = new Map([...present].map(([name, body]) => [name, bodyWrites(body)] as const));
  propagateWrites(present, writes);

  return [...present.keys()]
    .map((name) => ({ name, writes: writes.get(name) ?? false }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
