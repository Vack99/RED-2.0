import { mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { readRpcFunctions } from "./guards/denial-suite.ts";

// Materializes the RPC census `tools/guards/denial-suite.ts` already derives from
// supabase/migrations/ (the same replay `rpc-write-coverage.test.ts` uses) into one committed
// .sql file per surviving `public` function — "vista canónica de funciones": what's actually
// live, without re-reading 189 migrations by hand. Run: `pnpm gen:rpc-canon`.
// Drift (stale/missing/orphaned files) is caught by tools/guards/rpc-canon-drift.test.ts.
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..");
const OUT_DIR = join(REPO, "supabase", "functions-canonical");

mkdirSync(OUT_DIR, { recursive: true });

const functions = readRpcFunctions();
const expected = new Set(functions.map((f) => `${f.name}.sql`));

for (const fn of functions) {
  writeFileSync(join(OUT_DIR, `${fn.name}.sql`), fn.body.trim() + "\n");
}

for (const file of readdirSync(OUT_DIR)) {
  if (file.endsWith(".sql") && !expected.has(file)) rmSync(join(OUT_DIR, file));
}

console.log(`wrote ${functions.length} canonical RPC bodies to supabase/functions-canonical/`);
