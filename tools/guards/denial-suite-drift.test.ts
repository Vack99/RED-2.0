import { describe, expect, it } from "vitest";

import { readWiring, suiteFilesOnDisk } from "./denial-suite";

// Drift guard (#80): #78 shipped because a DB-test harness existed but its wiring didn't — a .sql
// suite sitting on disk, absent from the runner's SUITE array, protects nothing and fails silently
// forever. This guard closes that seam: every `*.sql` in supabase/tests/ must be listed in EITHER
// the runner's SUITE (it runs) OR its QUARANTINE (it is knowingly parked, with a stated reason).
// A new suite file added without wiring lands in neither set and fails this test — in the normal
// `pnpm test` gate, no scratch project required.
//
// Sibling shield: rpc-write-coverage.test.ts proves the other direction — every write-bearing RPC
// is covered BY a wired suite. Drift guards the files; coverage guards the functions.
describe("denial-suite wiring drift", () => {
  const { suite, quarantine } = readWiring();
  const listed = new Set([...suite, ...quarantine]);
  const onDisk = suiteFilesOnDisk();
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
