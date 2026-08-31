import { describe, expect, it } from "vitest";

import { isLocalhost, readGymDomainState } from "./gym-domain";

// `es_principal` invariant guard — shield plan (c)4
// (docs/superpowers/plans/2026-08-30-auth-door-shield-plan.md, LM-5).
//
// `gym_domain_principal_uniq` (20260828130000) is a PARTIAL unique index: it forbids a
// SECOND `es_principal = true` row per `(gym_id, app)`, but nothing requires a FIRST one.
// A `(gym_id, app)` pair with two-or-more real hosts and zero flagged rows silently falls
// back to the three link-minting selectors' oldest-row-wins tie-break (invitaciones.ts,
// gym.ts's getAdminHosts/getClientHost) — the exact drift FC-12/D8 describe, just waiting
// for the next BYO domain to reintroduce it wherever this guard is not watching.
//
// SCOPE — read tools/guards/gym-domain.ts's header before trusting a green result. This
// guard sees only what a pure migration replay can construct: today that is "forge" and
// "red", the two gyms an unconditional `insert into public.gym` creates. `red-demo` and
// `forge-demo` are live gyms seeded ad hoc outside migrations, so their gym_domain rows —
// written inside DO blocks guarded on those gyms already existing — are invisible to this
// replay, exactly as they are to every other replay-based guard in this repo. If those
// gyms are ever given a real client/admin host with >= 2 non-localhost rows, THIS TEST
// CANNOT SEE IT — that axis needs a live-DB check (see probe-host.mjs (c)3), not this one.
describe("es_principal invariant (migration-replayed gym_domain)", () => {
  const rows = readGymDomainState();

  // Tripwire on the parser itself (same posture as anon-read-surface.test.ts's tripwire):
  // every assertion below is vacuously green if the replay silently returns nothing, which
  // would turn this guard OFF while still reporting a pass.
  it("the migration replay still finds gym_domain rows (the parser has not silently died)", () => {
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.some((r) => r.esPrincipal)).toBe(true);
  });

  it("every (slug, app) group with >= 2 non-localhost hosts has exactly one es_principal", () => {
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      if (isLocalhost(row.hostname)) continue;
      const key = `${row.slug}::${row.app}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }

    const bad: string[] = [];
    for (const [key, group] of groups) {
      if (group.length < 2) continue;
      const principals = group.filter((r) => r.esPrincipal);
      if (principals.length !== 1) {
        bad.push(
          `${key}: ${group.length} non-localhost hosts (${group.map((r) => r.hostname).join(", ")}), ` +
            `${principals.length} flagged es_principal — expected exactly 1`,
        );
      }
    }
    expect(
      bad.sort(),
      `(gym, app) group(s) with >= 2 real hosts and not exactly one canonical host:\n${bad.join("\n")}\n` +
        `Without one, the outbound link selectors fall back to oldest-row-wins (FC-12/D8).`,
    ).toEqual([]);
  });

  it("no group has more than one es_principal regardless of host count (belt-and-braces on gym_domain_principal_uniq)", () => {
    const groups = new Map<string, typeof rows>();
    for (const row of rows) {
      const key = `${row.slug}::${row.app}`;
      groups.set(key, [...(groups.get(key) ?? []), row]);
    }
    const overflowing = [...groups.entries()]
      .filter(([, group]) => group.filter((r) => r.esPrincipal).length > 1)
      .map(([key]) => key);
    expect(overflowing, `group(s) with >1 es_principal — the unique index should have refused this: ${overflowing.join(", ")}`).toEqual(
      [],
    );
  });
});
