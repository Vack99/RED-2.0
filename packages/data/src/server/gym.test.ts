import { describe, expect, it } from "vitest";

import { getOperatorGym } from "./gym";
import type { SupabaseServer } from "./supabase";

/**
 * getOperatorGym — the operator's gym/tz/slug resolution (ADR-0013 membership).
 * Spec 2026-07-13 §1.3: the staff-role filter and the `gym_id` order live IN THE
 * QUERY (`.in()` + `.order()`), not in JS — a `.limit(1)` read picks its row at
 * the DB, so determinism under multi-membership can only come from the query
 * itself. This fake therefore FILTERS `.in()` and SORTS `.order()` for real
 * (purpose-built for this function; the shared helper only records), and the
 * SinGimnasio behavior for a member-only session falls out of the filter — no
 * JS role check remains to test separately. Injectable client (ADR-0001); RLS
 * itself (staff write, cross-tenant denial) is proven at the DB layer.
 */
function makeFake(opts: {
  sub?: string | null;
  membership?: Record<string, unknown>[];
  gymTimezone?: string;
  gymSlug?: string;
}) {
  const sub = opts.sub === undefined ? "op-1" : opts.sub;
  const membership = opts.membership ?? [{ gym_id: "gym-1", role: "owner" }];
  const inCalls: [string, unknown[]][] = [];
  const orderCalls: string[] = [];

  function membershipBuilder() {
    let rows = [...membership];
    const b: Record<string, unknown> = {
      select: () => b,
      in: (col: string, vals: unknown[]) => {
        inCalls.push([col, vals]);
        rows = rows.filter((r) => vals.includes(r[col]));
        return b;
      },
      order: (col: string) => {
        orderCalls.push(col);
        rows = [...rows].sort((a, bb) => String(a[col]).localeCompare(String(bb[col])));
        return b;
      },
      limit: () => b,
      maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
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
                data: {
                  timezone: opts.gymTimezone ?? "America/Chihuahua",
                  slug: opts.gymSlug ?? "forge",
                },
                error: null,
              }),
            }),
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { client: client as unknown as SupabaseServer, inCalls, orderCalls };
}

describe("getOperatorGym", () => {
  it("resolves the gym/tz/slug for an owner", async () => {
    const { client } = makeFake({ membership: [{ gym_id: "gym-1", role: "owner" }] });
    expect(await getOperatorGym(client)).toEqual({
      id: "gym-1",
      timezone: "America/Chihuahua",
      slug: "forge",
    });
  });

  it("resolves the gym/tz/slug for an operator", async () => {
    const { client } = makeFake({ membership: [{ gym_id: "gym-1", role: "operator" }] });
    expect(await getOperatorGym(client)).toEqual({
      id: "gym-1",
      timezone: "America/Chihuahua",
      slug: "forge",
    });
  });

  it("filters to staff roles and orders by gym_id IN THE QUERY (the determinism lives in SQL, not JS)", async () => {
    const { client, inCalls, orderCalls } = makeFake({});
    await getOperatorGym(client);
    expect(inCalls).toEqual([["role", ["owner", "operator"]]]);
    expect(orderCalls).toEqual(["gym_id"]);
  });

  it("under multi-membership, deterministically resolves the FIRST staff gym by gym_id — never the member row", async () => {
    const { client } = makeFake({
      membership: [
        { gym_id: "gym-c", role: "member" }, // socio row — must never win
        { gym_id: "gym-b", role: "operator" },
        { gym_id: "gym-a", role: "owner" },
      ],
    });
    const gym = await getOperatorGym(client);
    expect(gym.id).toBe("gym-a"); // staff rows sorted by gym_id; member filtered out
  });

  it("throws 'Sin gym asignado' for a member-only session (the staff filter leaves no row)", async () => {
    const { client } = makeFake({ membership: [{ gym_id: "gym-1", role: "member" }] });
    await expect(getOperatorGym(client)).rejects.toThrow("Sin gym asignado");
  });

  it("throws 'Sin gym asignado' when the caller holds no membership row at all", async () => {
    const { client } = makeFake({ membership: [] });
    await expect(getOperatorGym(client)).rejects.toThrow("Sin gym asignado");
  });

  it("throws 'No autenticado' for an anonymous caller", async () => {
    const { client } = makeFake({ sub: null });
    await expect(getOperatorGym(client)).rejects.toThrow("No autenticado");
  });
});
