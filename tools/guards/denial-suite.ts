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
// A future RPC that writes only transitively (a `perform` of another writer, no direct DML) classifies
// as a reader and is BARRED from the map by the no-pure-reader test; widen this or list it then.
const WRITES = /\b(?:insert\s+into|delete\s+from|merge\s+into)\b/i;
const WRITES_UPDATE = /\bupdate\b\s+\S+(?:\s+(?:as\s+)?\S+)?\s+set\b/i;

function bodyWrites(body: string): boolean {
  return WRITES.test(body) || WRITES_UPDATE.test(body);
}

/**
 * The `public` function census, derived from the migrations alone (no DB, no network).
 *
 * Order-sensitive and last-write-wins: migrations are replayed in filename order and, within a
 * file, in source order — a `drop` removes, a later `create` restores. `registrar_venta` is
 * dropped and recreated with a new signature, so a set-difference of creates-minus-drops would
 * wrongly report it absent.
 *
 * `writes` is DERIVED from the final definition's body, never declared: that is what makes the
 * coverage guard un-dodgeable. There is no hand-maintained "this one doesn't write" flag to flip.
 *
 * Verified against the live catalog (`pg_proc` where `pronamespace = 'public'`): exactly 34
 * functions, 25 writers, 9 pure readers — same names, no drift.
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

  return [...present]
    .map(([name, body]) => ({ name, writes: bodyWrites(body) }))
    .sort((a, b) => a.name.localeCompare(b.name));
}
