import { describe, expect, it } from "vitest";

import { getOperatorGym } from "./gym";
import type { SupabaseServer } from "./supabase";

/**
 * getOperatorGym — the operator's gym/tz resolution (ADR-0013 membership).
 * Slice #66 (S5 robustness): the membership read must reject a `member` role
 * (self-registered/claimed socio) — the admin app's SinGimnasio state depends
 * on this throwing for a member session (audit #19). Injectable client
 * (ADR-0001); RLS itself (staff write, cross-tenant denial) is proven at the
 * DB layer. The fake's `gym_membership` builder is the plain
 * `select().limit().maybeSingle()` chain every other DAL fake already shares
 * (no `.in()` needed — the role gate is a JS check in `gym.ts`, not a query
 * filter), so this stays consistent with the rest of the suite.
 */
function makeFake(opts: {
  sub?: string | null;
  membership?: Record<string, unknown>[];
  gymTimezone?: string;
}) {
  const sub = opts.sub === undefined ? "op-1" : opts.sub;
  const membership = opts.membership ?? [{ gym_id: "gym-1", role: "owner" }];

  function membershipBuilder() {
    const b: Record<string, unknown> = {
      select: () => b,
      limit: () => b,
      maybeSingle: async () => ({ data: membership[0] ?? null, error: null }),
    };
    return b;
  }

  const client = {
    auth: { getClaims: async () => ({ data: sub ? { claims: { sub } } : null }) },
    from: (table: string) => {
      if (table === "gym_membership") return membershipBuilder();
      if (table === "gym") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () => ({
                data: { timezone: opts.gymTimezone ?? "America/Chihuahua" },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return client as unknown as SupabaseServer;
}

describe("getOperatorGym", () => {
  it("resolves the gym/tz for an owner", async () => {
    const gym = await getOperatorGym(makeFake({ membership: [{ gym_id: "gym-1", role: "owner" }] }));
    expect(gym).toEqual({ id: "gym-1", timezone: "America/Chihuahua" });
  });

  it("resolves the gym/tz for an operator", async () => {
    const gym = await getOperatorGym(makeFake({ membership: [{ gym_id: "gym-1", role: "operator" }] }));
    expect(gym).toEqual({ id: "gym-1", timezone: "America/Chihuahua" });
  });

  it("throws 'Sin gym asignado' for a member-only session (no staff role)", async () => {
    await expect(
      getOperatorGym(makeFake({ membership: [{ gym_id: "gym-1", role: "member" }] })),
    ).rejects.toThrow("Sin gym asignado");
  });

  it("throws 'Sin gym asignado' when the caller holds no membership row at all", async () => {
    await expect(getOperatorGym(makeFake({ membership: [] }))).rejects.toThrow("Sin gym asignado");
  });

  it("throws 'No autenticado' for an anonymous caller", async () => {
    await expect(getOperatorGym(makeFake({ sub: null }))).rejects.toThrow("No autenticado");
  });
});
