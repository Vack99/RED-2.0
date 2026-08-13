import { readdirSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { readRpcFunctions } from "./denial-suite";

// Drift guard for the materialized "vista canónica de funciones": `tools/generate-rpc-canon.mjs`
// writes one supabase/functions-canonical/<name>.sql per surviving `public` function, using the
// same migration replay (`readRpcFunctions`) the denial-suite guards already derive from
// supabase/migrations/. This test recomputes that replay independently and fails if the committed
// files fall out of sync with it — missing, stale, or orphaned — so a migration that adds, drops,
// or edits a function can't silently leave the committed view stale.
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const OUT_DIR = join(REPO, "supabase", "functions-canonical");
const REGEN = "pnpm gen:rpc-canon";

describe("RPC canonical-body drift", () => {
  const functions = readRpcFunctions();
  const onDisk = readdirSync(OUT_DIR).filter((f) => f.endsWith(".sql"));
  const onDiskSet = new Set(onDisk);
  const expectedFiles = new Set(functions.map((f) => `${f.name}.sql`));

  it("every surviving RPC has a committed canonical file", () => {
    const missing = functions.filter((f) => !onDiskSet.has(`${f.name}.sql`)).map((f) => f.name).sort();
    expect(
      missing,
      `RPC(s) with no supabase/functions-canonical/ file — run \`${REGEN}\`: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("no committed file is orphaned (function dropped or renamed)", () => {
    const orphaned = onDisk.filter((f) => !expectedFiles.has(f)).sort();
    expect(
      orphaned,
      `orphaned file(s) in supabase/functions-canonical/ — run \`${REGEN}\`: ${orphaned.join(", ")}`,
    ).toEqual([]);
  });

  it("every committed file matches the migration-derived body", () => {
    const stale = functions
      .filter((f) => onDiskSet.has(`${f.name}.sql`))
      .filter((f) => readFileSync(join(OUT_DIR, `${f.name}.sql`), "utf8") !== f.body.trim() + "\n")
      .map((f) => f.name)
      .sort();
    expect(stale, `stale canonical file(s) — run \`${REGEN}\`: ${stale.join(", ")}`).toEqual([]);
  });
});
