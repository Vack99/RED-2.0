import { describe, expect, it } from "vitest";

import { getAdminHosts, getClientHost, getOperatorGym, getOperatorGyms } from "./gym";
import type { SupabaseServer } from "./supabase";

/**
 * Multi-key, direction-aware comparator for the fakes below. The host pickers now chain TWO
 * `.order()`s (`es_principal desc, created_at asc`), and a fake that re-sorts the whole list on
 * every `.order()` call would LIE about both halves: the second sort discards the first, and
 * `String(false) < String(true)` puts the principal LAST. So the fakes record the keys and sort
 * once, here. Booleans (and a `es_principal` the fixture simply omits — `false` in the DB, whose
 * `not null default false` makes a missing value impossible) compare as numbers; text compares
 * as text.
 */
function comparar(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  keys: readonly [string, boolean][],
): number {
  for (const [col, ascending] of keys) {
    const av = a[col];
    const bv = b[col];
    const d =
      typeof av === "boolean" || typeof bv === "boolean" || av == null || bv == null
        ? Number(av === true) - Number(bv === true)
        : String(av).localeCompare(String(bv));
    if (d !== 0) return ascending ? d : -d;
  }
  return 0;
}

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
 * `slugDelHost()` (inquilino.ts) reads `next/headers`, which throws outside a request scope
 * — exactly where these tests live — so every case here exercises the no-host fallback path.
 */
function makeFake(opts: {
  sub?: string | null;
  membership?: Record<string, unknown>[];
  gymTimezone?: string;
  gymSlug?: string;
  gymBrandName?: string;
  gymBookingEnabled?: boolean;
  dominios?: Record<string, unknown>[];
}) {
  const sub = opts.sub === undefined ? "op-1" : opts.sub;
  const gymPorDefecto = {
    timezone: opts.gymTimezone ?? "America/Chihuahua",
    slug: opts.gymSlug ?? "forge",
    brand_name: opts.gymBrandName ?? "Forge",
    booking_enabled: opts.gymBookingEnabled ?? false,
  };
  // `user_id` defaults to the caller's own sub — every existing fixture row IS the
  // caller's own membership unless a test overrides it (the co-staff duplicate case below).
  const membership = (opts.membership ?? [{ gym_id: "gym-1", role: "owner" }]).map((m) => ({
    gym: gymPorDefecto,
    user_id: sub,
    ...m,
  }));
  const inCalls: [string, unknown[]][] = [];
  const orderCalls: [string, boolean][] = [];
  const eqCalls: [string, unknown][] = [];
  const notCalls: [string, string, unknown][] = [];

  function listBuilder(rows: Record<string, unknown>[]) {
    let list = [...rows];
    const keys: [string, boolean][] = [];
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
      order: (col: string, opts?: { ascending?: boolean }) => {
        const key: [string, boolean] = [col, opts?.ascending !== false];
        orderCalls.push(key);
        keys.push(key);
        return b;
      },
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
        resolve({ data: [...list].sort((a, bb) => comparar(a, bb, keys)), error: null }),
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
      bookingEnabled: false,
      userId: "op-1",
    });
  });

  it("resolves the gym/tz/slug/brand for an operator", async () => {
    const { client } = makeFake({ membership: [{ gym_id: "gym-1", role: "operator" }] });
    expect(await getOperatorGym(client)).toEqual({
      id: "gym-1",
      timezone: "America/Chihuahua",
      slug: "forge",
      brandName: "Forge",
      bookingEnabled: false,
      userId: "op-1",
    });
  });

  it("passes gym.brand_name through as the mixed-case brandName (render sites uppercase)", async () => {
    const { client } = makeFake({
      membership: [{ gym_id: "gym-1", role: "owner" }],
      gymBrandName: "RED",
    });
    expect((await getOperatorGym(client)).brandName).toBe("RED");
  });

  // The mode spine (#327): `modo()` in @gym/domain derives 'lista' | 'cupo' from THIS raw
  // flag, so the read has to carry it through untouched — not pre-derived here, so every
  // caller applies the same one derivation.
  it("passes gym.booking_enabled through as the raw bookingEnabled flag", async () => {
    const { client } = makeFake({
      membership: [{ gym_id: "gym-1", role: "owner" }],
      gymBookingEnabled: true,
    });
    expect((await getOperatorGym(client)).bookingEnabled).toBe(true);
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
    expect(orderCalls).toEqual([["gym_id", true]]);
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

  // `gym_membership_staff_select` (RLS) lets any staff member of a gym read every OTHER
  // staff member's row for that gym too — permissive policies OR together. Without the
  // `.eq("user_id", …)` filter this query would hand back BOTH owner/operator rows for
  // gym-1, embedding the same gym twice: a duplicate slug, and `decideTenant` reading
  // `misGyms.length` as 2 instead of 1 (the `choose` chooser instead of `redirect`).
  it("filters to the caller's OWN membership row, even when RLS would also surface a co-staff's row for the same gym", async () => {
    const { client, eqCalls } = makeFake({
      sub: "op-1",
      membership: [
        { gym_id: "gym-1", role: "owner", user_id: "op-1" },
        { gym_id: "gym-1", role: "operator", user_id: "op-99" },
      ],
    });
    const gyms = await getOperatorGyms(client);
    expect(gyms).toHaveLength(1);
    expect(gyms[0]).toMatchObject({ id: "gym-1", userId: "op-1" });
    expect(eqCalls).toEqual([["user_id", "op-1"]]);
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

  it("first-wins on created_at when a gym maps several admin hosts and NEITHER is principal", async () => {
    const { client, orderCalls } = makeFake({
      dominios: [
        { gym_id: "gym-a", hostname: "nuevo.forge.mx", app: "admin", created_at: "2026-01-01" },
        { gym_id: "gym-a", hostname: "admin.forge.mx", app: "admin", created_at: "2020-01-01" },
      ],
    });
    expect(await getAdminHosts(["gym-a"], client)).toEqual({ "gym-a": "admin.forge.mx" });
    expect(orderCalls).toEqual([
      ["es_principal", false],
      ["created_at", true],
    ]);
  });

  // The declared canonical host BEATS age — the whole point of es_principal. Without the
  // principal-first key the chooser would keep linking the retired host forever.
  it("the declared principal wins even when it is the NEWER admin host", async () => {
    const { client } = makeFake({
      dominios: [
        { gym_id: "gym-a", hostname: "viejo.forge.mx", app: "admin", created_at: "2020-01-01", es_principal: false },
        { gym_id: "gym-a", hostname: "nuevo.forge.mx", app: "admin", created_at: "2026-01-01", es_principal: true },
      ],
    });
    expect(await getAdminHosts(["gym-a"], client)).toEqual({ "gym-a": "nuevo.forge.mx" });
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
  const orderCalls: [string, boolean][] = [];
  let limitCall: number | null = null;
  const client = {
    from: (table: string) => {
      if (table !== "gym_domain") throw new Error(`unexpected table ${table}`);
      const keys: [string, boolean][] = [];
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
        order: (col: string, opts?: { ascending?: boolean }) => {
          const key: [string, boolean] = [col, opts?.ascending !== false];
          orderCalls.push(key);
          keys.push(key);
          return b;
        },
        // Records only — the slice has to happen AFTER the sort, or `limit(1)` would keep the
        // first row of the UNSORTED list and the order keys would never decide anything.
        limit: (n: number) => {
          limitCall = n;
          return b;
        },
        maybeSingle: async () => ({
          data: [...list].sort((a, bb) => comparar(a, bb, keys)).slice(0, limitCall ?? list.length)[0] ?? null,
          error: null,
        }),
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

  it("first-wins on created_at when a gym maps several client hosts and NEITHER is principal", async () => {
    const { client, orderCalls, limitCall } = makeClientHostFake([
      { gym_id: "gym-a", hostname: "nuevo.forge.mx", app: "client", created_at: "2026-01-01" },
      { gym_id: "gym-a", hostname: "app.forge.mx", app: "client", created_at: "2020-01-01" },
    ]);
    expect(await getClientHost("gym-a", client)).toBe("app.forge.mx");
    expect(orderCalls).toEqual([
      ["es_principal", false],
      ["created_at", true],
    ]);
    expect(limitCall()).toBe(1);
  });

  // RED's shape after 2026-08-28: its own domain is the NEWEST row and the declared principal.
  it("the declared principal wins even when it is the NEWER client host", async () => {
    const { client } = makeClientHostFake([
      { gym_id: "gym-a", hostname: "red.ibookit.lat", app: "client", created_at: "2026-07-09", es_principal: false },
      {
        gym_id: "gym-a",
        hostname: "www.redfunctionaltraining.com",
        app: "client",
        created_at: "2026-08-28",
        es_principal: true,
      },
    ]);
    expect(await getClientHost("gym-a", client)).toBe("www.redfunctionaltraining.com");
  });

  // es_principal is a preference applied AFTER the dev-host filter, never a way back in: a
  // mis-flagged `.localhost` row must not become a member-facing URL.
  it("a principal `.localhost` row still loses to the unflagged public host", async () => {
    const { client } = makeClientHostFake([
      { gym_id: "gym-a", hostname: "app.forge.localhost", app: "client", created_at: "2020-01-01", es_principal: true },
      { gym_id: "gym-a", hostname: "app.forge.mx", app: "client", created_at: "2024-01-01", es_principal: false },
    ]);
    expect(await getClientHost("gym-a", client)).toBe("app.forge.mx");
  });

  it("returns null for a gym with no mapped client host — the caller's merge field stays unresolved, never fabricated", async () => {
    const { client } = makeClientHostFake([]);
    expect(await getClientHost("gym-a", client)).toBeNull();
  });
});
