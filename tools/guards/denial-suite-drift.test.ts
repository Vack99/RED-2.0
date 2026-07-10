import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Drift guard (#80): #78 shipped because a DB-test harness existed but its wiring didn't — a .sql
// suite sitting on disk, absent from the runner's SUITE array, protects nothing and fails silently
// forever. This guard closes that seam: every `*.sql` in supabase/tests/ must be listed in EITHER
// the runner's SUITE (it runs) OR its QUARANTINE (it is knowingly parked, with a stated reason).
// A new suite file added without wiring lands in neither set and fails this test — in the normal
// `pnpm test` gate, no scratch project required. We parse the runner SOURCE (not import it) so the
// check has zero coupling to the module's runtime/env/type setup and can't be broken by it.
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const TESTS_DIR = join(REPO, "supabase", "tests");
const RUNNER = join(TESTS_DIR, "run-denial-suite.mjs");

function parseArray(source: string, name: string): string[] {
  const block = source.match(new RegExp(`export const ${name} = \\[([\\s\\S]*?)\\];`));
  if (!block) throw new Error(`could not locate the ${name} array in run-denial-suite.mjs`);
  return [...block[1].matchAll(/'([^']+\.sql)'/g)].map((m) => m[1]);
}

describe("denial-suite wiring drift", () => {
  const source = readFileSync(RUNNER, "utf8");
  const suite = parseArray(source, "SUITE");
  const quarantine = parseArray(source, "QUARANTINE");
  const listed = new Set([...suite, ...quarantine]);
  const onDisk = readdirSync(TESTS_DIR).filter((f) => f.endsWith(".sql"));
  const onDiskSet = new Set(onDisk);

  it("every .sql suite file is wired into SUITE or QUARANTINE", () => {
    const unwired = onDisk.filter((f) => !listed.has(f)).sort();
    expect(
      unwired,
      `suite file(s) on disk but in neither SUITE nor QUARANTINE — they run nowhere and protect nothing: ${unwired.join(", ")}`,
    ).toEqual([]);
  });

  it("every listed file exists on disk (no phantom/typo entries)", () => {
    const phantom = [...suite, ...quarantine].filter((f) => !onDiskSet.has(f)).sort();
    expect(phantom, `SUITE/QUARANTINE name(s) with no matching .sql file: ${phantom.join(", ")}`).toEqual([]);
  });

  it("no file is both wired and quarantined", () => {
    const overlap = suite.filter((f) => quarantine.includes(f)).sort();
    expect(overlap, `file(s) in both SUITE and QUARANTINE: ${overlap.join(", ")}`).toEqual([]);
  });
});
