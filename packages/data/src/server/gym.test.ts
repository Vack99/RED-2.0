import { describe, expect, it } from "vitest";

import { getAdminHosts, getClientHost, getOperatorGym, getOperatorGyms } from "./gym";
import type { SupabaseServer } from "./supabase";

/**
 * getOperatorGyms/getOperatorGym — the operator's gym/tz/slug resolution (ADR-0013
 * membership). Spec 2026-07-13 §1.3: the staff-role filter and the `gym_id` order live
 * IN THE QUERY (`.in()` + `.order()`), not in JS — they are what make the pick
 * deterministic. This fake therefore FILTERS `.in()` and SORTS `.order()` for real
 * (purpose-built for this function; the shared helper only records) and pre-joins the
 * embedded `gym(...)` FK the read now uses, and the SinGimnasio behavior for a
 * member-only session falls out of the filter — no JS role check remains to test
 * separately. Injectable client (ADR-0001); RLS itself (staff write, cross-tenant
 * denial) is proven at the DB layer.
 *
 * `hostGymSlug()` reads `next/headers`, which throws outside a request scope — exactly
 * where these tests live — so every case here exercises the no-host fallback path.
 */
function makeFake(opts: {
  sub?: string | null;
  membership?: Record<string, unknown>[];
  gymTimezone?: string;
  gymSlug?: string;
  gymBrandName?: string;
  dominios?: Record<string, unknown>[];
}) {
  const sub = opts.sub === undefined ? "op-1" : opts.sub;
  const gymPorDefecto = {
    timezone: opts.gymTimezone ?? "America/Chihuahua",
    slug: opts.gymSlug ?? "forge",
    brand_name: opts.gymBrandName ?? "Forge",
  };
  const membership = (opts.membership ?? [{ gym_id: "gym-1", role: "owner" }]).map((m) => ({
    gym: gymPorDefecto,
    ...m,
  }));
  const inCalls: [string, unknown[]][] = [];
  const orderCalls: string[] = [];
  const eqCalls: [string, unknown][] = [];
  const notCalls: [string, string, unknown][] = [];

  function listBuilder(rows: Record<string, unknown>[]) {
    let list = [...rows];
    const b: Record<string, unknown> = {
      select: () => b,
      in: (col: string, vals: unknown[]) => {
        inCalls.push([col, vals]);
        list = list.filter((r) => vals.includes(r[col]));
        return b;
      },
      eq: (col: string, val: unknown) => {
        eqCalls.push([col, val]);
        list = list.filter((r) => r[col] === val);
        return b;
      },
      not: (col: string, op: string, val: unknown) => {
        notCalls.push([col, op, val]);
        list = list.filter((r) => !String(r[col]).endsWith("localhost"));
        return b;
      },
      order: (col: string) => {
        orderCalls.push(col);
        list = [...list].sort((a, bb) => String(a[col]).localeCompare(String(bb[col])));
        return b;
      },
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        resolve({ data: list, error: null }),
    };
    return b;
  }

  const client = {
    auth: { getClaims: async () => ({ data: sub ? { claims: { sub } } : null }) },
    from: (table: string) => {
      if (table === "gym_membership") return listBuilder(membership);
      if (table === "gym_domain") return listBuilder(opts.dominios ?? []);
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { client: client as unknown as SupabaseServer, inCalls, orderCalls, eqCalls, notCalls };
}

describe("getOperatorGym", () => {
  it("resolves the gym/tz/slug/brand for an owner", async () => {
    const { client } = makeFake({ membership: [{ gym_id: "gym-1", role: "owner" }] });
    expect(await getOperatorGym(client)).toEqual({
      id: "gym-1",
      timezone: "America/Chihuahua",
      slug: "forge",
      brandName: "Forge",
      userId: "op-1",
      role: "owner",
    });
  });

  it("resolves the gym/tz/slug/brand for an operator", async () => {
    const { client } = makeFake({ membership: [{ gym_id: "gym-1", role: "operator" }] });
    expect(await getOperatorGym(client)).toEqual({
      id: "gym-1",
      timezone: "America/Chihuahua",
      slug: "forge",
      brandName: "Forge",
      userId: "op-1",
      role: "operator",
    });
  });

  // Gate 0.1 click-wrap (#254): the layout picks the owner accept form vs. the operator
  // block on THIS field — a wrong value would let an operator either see the accept form
  // (unauthorized surface, even though the RPC would still refuse) or block an owner outright.
  it("carries the role through as `role` (owner vs operator, never member — the query already filters member out)", async () => {
    const { client } = makeFake({ membership: [{ gym_id: "gym-1", role: "operator" }] });
    expect((await getOperatorGym(client)).role).toBe("operator");
  });

  it("passes gym.brand_name through as the mixed-case brandName (render sites uppercase)", async () => {
    const { client } = makeFake({
      membership: [{ gym_id: "gym-1", role: "owner" }],
      gymBrandName: "RED",
    });
    expect((await getOperatorGym(client)).brandName).toBe("RED");
  });

  // The crossing log (#204) names WHO crossed. It reads the sub off this DTO rather
  // than issuing its own getClaims(), so the sub must survive the resolution.
  it("carries the claim sub through as userId", async () => {
    const { client } = makeFake({ sub: "op-42" });
    expect((await getOperatorGym(client)).userId).toBe("op-42");
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

describe("getOperatorGyms", () => {
  it("returns EVERY staff gym ordered by gym_id — the chooser (#208) needs the list, not the pick", async () => {
    const { client } = makeFake({
      membership: [
        { gym_id: "gym-b", role: "operator", gym: { timezone: "UTC", slug: "red", brand_name: "RED" } },
        { gym_id: "gym-c", role: "member" }, // socio row — filtered by the query
        { gym_id: "gym-a", role: "owner" },
      ],
    });
    expect((await getOperatorGyms(client)).map((g) => g.slug)).toEqual(["forge", "red"]);
  });

  it("is empty for a member-only session, instead of throwing (the layout branches on it)", async () => {
    const { client } = makeFake({ membership: [{ gym_id: "gym-1", role: "member" }] });
    expect(await getOperatorGyms(client)).toEqual([]);
  });

  // PostgREST embeds `gym` as null when the FK row is unreadable (RLS) or missing; a
  // membership pointing at nothing is not a gym the operator can be sent to.
  it("drops a membership whose embedded gym did not come back", async () => {
    const { client } = makeFake({ membership: [{ gym_id: "gym-1", role: "owner", gym: null }] });
    expect(await getOperatorGyms(client)).toEqual([]);
  });
});

/**
 * getAdminHosts — THE redirect-target source (#212 constraint 1: server-derived, never
 * from a param/header/cookie) and the chooser's links (#208).
 */
describe("getAdminHosts", () => {
  it("maps each gym to its admin hostname", async () => {
    const { client } = makeFake({
      dominios: [
        { gym_id: "gym-a", hostname: "admin.forge.mx", app: "admin", created_at: "2024-01-01" },
        { gym_id: "gym-b", hostname: "admin.red.mx", app: "admin", created_at: "2024-01-01" },
      ],
    });
    expect(await getAdminHosts(["gym-a", "gym-b"], client)).toEqual({
      "gym-a": "admin.forge.mx",
      "gym-b": "admin.red.mx",
    });
  });

  it("scopes to the ids asked for, to app='admin', and drops the dev-only .localhost rows", async () => {
    const { client, inCalls, eqCalls, notCalls } = makeFake({
      dominios: [
        { gym_id: "gym-a", hostname: "admin.forge.localhost", app: "admin", created_at: "2020-01-01" },
        { gym_id: "gym-a", hostname: "admin.forge.mx", app: "admin", created_at: "2024-01-01" },
      ],
    });
    expect(await getAdminHosts(["gym-a"], client)).toEqual({ "gym-a": "admin.forge.mx" });
    expect(inCalls).toEqual([["gym_id", ["gym-a"]]]);
    expect(eqCalls).toEqual([["app", "admin"]]);
    expect(notCalls).toEqual([["hostname", "like", "%localhost"]]);
  });

  it("first-wins on created_at when a gym maps several admin hosts (dev mirror + live)", async () => {
    const { client, orderCalls } = makeFake({
      dominios: [
        { gym_id: "gym-a", hostname: "nuevo.forge.mx", app: "admin", created_at: "2026-01-01" },
        { gym_id: "gym-a", hostname: "admin.forge.mx", app: "admin", created_at: "2020-01-01" },
      ],
    });
    expect(await getAdminHosts(["gym-a"], client)).toEqual({ "gym-a": "admin.forge.mx" });
    expect(orderCalls).toEqual(["created_at"]);
  });

  it("omits a gym with no admin host — the chooser renders it without a link", async () => {
    const { client } = makeFake({ dominios: [] });
    expect(await getAdminHosts(["gym-a"], client)).toEqual({});
  });
});

/**
 * getClientHost — the CUENTA legal-identity preview's aviso-URL source (#256): the singular,
 * app='client' twin of getAdminHosts above. Its `.limit(1).maybeSingle()` shape differs from
 * getAdminHosts' array read, so it gets its own small chain-recording fake rather than reusing
 * `makeFake` above (which resolves via a bare `.then()`, never `.maybeSingle()`).
 */
function makeClientHostFake(dominios: Record<string, unknown>[]) {
  let list = [...dominios];
  const eqCalls: [string, unknown][] = [];
  const notCalls: [string, string, unknown][] = [];
  const orderCalls: string[] = [];
  let limitCall: number | null = null;
  const client = {
    from: (table: string) => {
      if (table !== "gym_domain") throw new Error(`unexpected table ${table}`);
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (col: string, val: unknown) => {
          eqCalls.push([col, val]);
          list = list.filter((r) => r[col] === val);
          return b;
        },
        not: (col: string, op: string, val: unknown) => {
          notCalls.push([col, op, val]);
          list = list.filter((r) => !String(r[col]).endsWith("localhost"));
          return b;
        },
        order: (col: string) => {
          orderCalls.push(col);
          list = [...list].sort((a, bb) => String(a[col]).localeCompare(String(bb[col])));
          return b;
        },
        limit: (n: number) => {
          limitCall = n;
          list = list.slice(0, n);
          return b;
        },
        maybeSingle: async () => ({ data: list[0] ?? null, error: null }),
      };
      return b;
    },
  };
  return { client: client as unknown as SupabaseServer, eqCalls, notCalls, orderCalls, limitCall: () => limitCall };
}

describe("getClientHost", () => {
  it("returns the gym's client hostname", async () => {
    const { client } = makeClientHostFake([
      { gym_id: "gym-a", hostname: "app.forge.mx", app: "client", created_at: "2024-01-01" },
    ]);
    expect(await getClientHost("gym-a", client)).toBe("app.forge.mx");
  });

  it("scopes to the gym id, to app='client', and drops the dev-only .localhost row", async () => {
    const { client, eqCalls, notCalls } = makeClientHostFake([
      { gym_id: "gym-a", hostname: "app.forge.localhost", app: "client", created_at: "2020-01-01" },
      { gym_id: "gym-a", hostname: "app.forge.mx", app: "client", created_at: "2024-01-01" },
    ]);
    expect(await getClientHost("gym-a", client)).toBe("app.forge.mx");
    expect(eqCalls).toEqual([
      ["gym_id", "gym-a"],
      ["app", "client"],
    ]);
    expect(notCalls).toEqual([["hostname", "like", "%localhost"]]);
  });

  it("first-wins on created_at when a gym maps several client hosts (dev mirror + live)", async () => {
    const { client, orderCalls, limitCall } = makeClientHostFake([
      { gym_id: "gym-a", hostname: "nuevo.forge.mx", app: "client", created_at: "2026-01-01" },
      { gym_id: "gym-a", hostname: "app.forge.mx", app: "client", created_at: "2020-01-01" },
    ]);
    expect(await getClientHost("gym-a", client)).toBe("app.forge.mx");
    expect(orderCalls).toEqual(["created_at"]);
    expect(limitCall()).toBe(1);
  });

  it("returns null for a gym with no mapped client host — the caller's merge field stays unresolved, never fabricated", async () => {
    const { client } = makeClientHostFake([]);
    expect(await getClientHost("gym-a", client)).toBeNull();
  });
});
