import { describe, expect, it } from "vitest";

import { readAllPolicies, readAllowlist, readAnonReadPolicies, scopeOf } from "./anon-read";

// Anon-read surface guard (#214, epic #203). Third sibling of denial-suite-drift.test.ts
// and rpc-write-coverage.test.ts — and the one that closes the axis the other two miss.
// Both of those key on WRITE RPCs. The 2026-08-02 cross-examination found every confirmed
// cross-tenant read on the anon-READ axis, which had no guard of any kind:
//
//   docs/health/2026-07-05-post-cutover-db-audit.md:27 certifies
//     "I3 — Anon reads limited to `gym` + `gym_domain` only — PASS"
//   20260706160000_phase6_anon_catalog_read.sql adds 14 more `to anon using (true)` — the
//   NEXT DAY. 20260706165900_create_gym_contact.sql adds a 15th. Nothing re-ran the audit;
//   the 2026-07-27 audit restated the guarantee in a stronger form that was already false.
//   27 days.
//
// A PASS with no expiry and no re-runner is a belief. This is the re-runner.
//
// Deliberate limits, stated so nobody mistakes green for safety:
//  - It proves a table is LISTED with a stated reason and that its scope has not widened.
//    It cannot judge whether the reason is a good one — that stays a human call at review.
//  - It reads migrations, not the live database. A policy created by hand in the dashboard
//    is invisible here, exactly as it is to every other guard in this repo.
//  - GRANTS are not modelled (see anon-read.ts). `gym` is anon-readable AND column-narrowed;
//    both facts are true, and the allow-file entry is where the second one is recorded.
describe("anon-read surface", () => {
  const derived = readAnonReadPolicies();
  const allow = readAllowlist();
  const tables = [...new Set(derived.map((p) => p.table))].sort();

  // Tripwire on the parser itself. Every assertion below is vacuously green if the replay
  // silently returns nothing — a regex that stops matching would turn this guard OFF while
  // still reporting a pass, which is the exact failure mode it exists to prevent elsewhere.
  it("the migration replay still finds the policy corpus (the parser has not silently died)", () => {
    expect(readAllPolicies().length).toBeGreaterThan(80);
    expect(derived.length).toBeGreaterThan(10);
  });

  it("every anon-readable table is listed in the allow-file", () => {
    const missing = tables.filter((t) => !Object.hasOwn(allow, t)).sort();
    expect(
      missing,
      `table(s) readable by \`anon\` with no entry in supabase/tests/anon-read-allowlist.json.\n` +
        `The publishable key is in every browser bundle by design (ADR-0008), so this is a\n` +
        `PUBLIC read surface — add each table with a scope and a reason, or scope its policy:\n` +
        `  ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("the allow-file lists no table that is no longer anon-readable", () => {
    const live = new Set(tables);
    const stale = Object.keys(allow)
      .filter((t) => !live.has(t))
      .sort();
    expect(
      stale,
      `allow-file entr(ies) for table(s) anon can no longer read — delete them so the file\n` +
        `keeps meaning what it says: ${stale.join(", ")}`,
    ).toEqual([]);
  });

  it("every entry states a reason", () => {
    const empty = Object.entries(allow)
      .filter(([, e]) => !e.reason?.trim())
      .map(([t]) => t)
      .sort();
    expect(empty, `allow-file entr(ies) with an empty reason: ${empty.join(", ")}`).toEqual([]);
  });

  // The widening arm. `all-gyms` means the USING predicate is literally `true`: one
  // anonymous call returns every tenant's rows. #215 and #216 flip entries to `scoped`;
  // this pins them there, so a scoped policy silently reverting fails like a new table.
  it("no policy is broader than the scope its allow-file entry declares", () => {
    const widened = derived
      .filter((p) => allow[p.table] && allow[p.table].scope !== scopeOf(p))
      .map((p) => `${p.table}.${p.policy}: declared ${allow[p.table].scope}, is ${scopeOf(p)} — using (${p.using})`)
      .sort();
    expect(
      widened,
      `anon SELECT policy(ies) whose real scope does not match the allow-file:\n${widened.join("\n")}`,
    ).toEqual([]);
  });
});
