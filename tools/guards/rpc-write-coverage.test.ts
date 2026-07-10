import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { TESTS_DIR, readRpcFunctions, readWiring, suiteFilesOnDisk, suiteInvokes } from "./denial-suite";

// RPC write-coverage guard (#80 AC6). Sibling of denial-suite-drift.test.ts: that one proves every
// suite FILE is wired; this one proves every write-bearing RPC is COVERED by a wired suite.
//
// The obligation set is DERIVED from supabase/migrations/, never declared (see readRpcFunctions):
// a new write-bearing RPC lands uncovered → this test fails → the gap is visible at commit time,
// not in production. That is AC6's "a new RPC without coverage is visible", machine-enforced, and
// there is no `writes: false` flag to dodge with.
//
// Deliberate limit, stated so nobody mistakes green for safety: this guard proves a covering suite
// EXISTS, is WIRED, and INVOKES the function. It cannot prove the suite asserts the function's
// WRITTEN ROWS rather than its return value — that is the identity-vs-payload seam #78 lived in,
// and it stays a human rule (AGENTS.md) enforced at review.
type Entry = { suites?: string[]; quarantined?: string };

const map = JSON.parse(readFileSync(join(TESTS_DIR, "rpc-coverage.json"), "utf8")) as {
  coverage: Record<string, Entry>;
};

describe("RPC write-coverage", () => {
  const functions = readRpcFunctions();
  const writers = functions.filter((f) => f.writes).map((f) => f.name);
  const readers = functions.filter((f) => !f.writes).map((f) => f.name);
  const { suite, quarantine } = readWiring();
  const onDisk = new Set(suiteFilesOnDisk());
  const entries = Object.entries(map.coverage);

  it("every write-bearing RPC is listed in the coverage map", () => {
    const listed = new Set(Object.keys(map.coverage));
    const missing = writers.filter((f) => !listed.has(f)).sort();
    expect(
      missing,
      `write-bearing RPC(s) with no entry in rpc-coverage.json — they can drop a column and no test would fail: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("the coverage map lists no pure reader and no phantom function", () => {
    const writerSet = new Set(writers);
    const readerSet = new Set(readers);
    const stale = Object.keys(map.coverage)
      .filter((f) => !writerSet.has(f))
      .map((f) => (readerSet.has(f) ? `${f} (pure reader — writes nothing to assert)` : `${f} (no such function)`))
      .sort();
    expect(stale, `rpc-coverage.json entr(ies) that should not be there: ${stale.join(", ")}`).toEqual([]);
  });

  it("every covered RPC names at least one suite, and each is wired into SUITE", () => {
    const bad: string[] = [];
    for (const [fn, entry] of entries) {
      if (entry.quarantined) continue;
      const suites = entry.suites ?? [];
      if (suites.length === 0) bad.push(`${fn}: no suites listed and not quarantined`);
      for (const f of suites) {
        if (!onDisk.has(f)) bad.push(`${fn}: names ${f}, which does not exist on disk`);
        else if (!suite.includes(f)) bad.push(`${fn}: names ${f}, which is not in the runner's SUITE (it never runs)`);
      }
    }
    expect(bad.sort(), `coverage entries pointing at suites that cannot protect them:\n${bad.join("\n")}`).toEqual([]);
  });

  it("every named suite actually invokes the RPC it is credited with", () => {
    const bad: string[] = [];
    for (const [fn, entry] of entries) {
      for (const f of entry.suites ?? []) {
        if (!onDisk.has(f)) continue; // reported by the previous test
        if (!suiteInvokes(f, fn)) bad.push(`${fn}: credited to ${f}, which never calls it`);
      }
    }
    expect(bad.sort(), `coverage claims not backed by a call site:\n${bad.join("\n")}`).toEqual([]);
  });

  it("every quarantined RPC states a reason and points only at quarantined suites", () => {
    const bad: string[] = [];
    for (const [fn, entry] of entries) {
      if (!entry.quarantined) continue;
      if (!entry.quarantined.trim()) bad.push(`${fn}: quarantined with an empty reason`);
      for (const f of entry.suites ?? []) {
        if (!onDisk.has(f)) bad.push(`${fn}: names ${f}, which does not exist on disk`);
        else if (!quarantine.includes(f)) bad.push(`${fn}: quarantined but names ${f}, which is not in QUARANTINE`);
      }
    }
    expect(bad.sort(), `malformed quarantine entries:\n${bad.join("\n")}`).toEqual([]);
  });
});
