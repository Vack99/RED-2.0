import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SupabaseServer } from "./supabase";
import { clearTenantCache, resolveTenant, tenantHeaders, type Tenant } from "./resolve-tenant";

// resolveTenant is the DB-backed host→gym seam both proxies run (ADR-0012 §5, as
// amended 2026-07-02). These arms pin host-wins precedence — a `gym_domain` row ›
// a `?gym=` override naming a real gym slug (open set, validated against the DB) ›
// NO tenant — against an injected fake of the anon `gym`/`gym_domain` reads, so
// "one deployment resolves the inquilino by host" is falsifiable without the live DB.

type GymRow = { id: string; slug: string; brand_module_id: string };
type DomainRow = { hostname: string; gym_id: string };

const GYMS: GymRow[] = [
  { id: "gym-forge", slug: "forge", brand_module_id: "forge" },
  { id: "gym-red", slug: "red", brand_module_id: "red" },
];
const DOMAINS: DomainRow[] = [
  { hostname: "forge.localhost", gym_id: "gym-forge" },
  { hostname: "red.localhost", gym_id: "gym-red" },
];

// Minimal fake of the client: a per-table `.select().eq().maybeSingle()` chain that
// resolves the first seeded row matching every `.eq(col, val)` (or null).
function fakeDb(gyms: GymRow[], domains: DomainRow[]): SupabaseServer {
  const table = (rows: Record<string, unknown>[]) => {
    let filtered = rows;
    const b = {
      select: () => b,
      eq: (col: string, val: unknown) => {
        filtered = filtered.filter((r) => r[col] === val);
        return b;
      },
      maybeSingle: () => Promise.resolve({ data: filtered[0] ?? null, error: null }),
    };
    return b;
  };
  return {
    from: (t: string) =>
      table((t === "gym" ? gyms : domains) as unknown as Record<string, unknown>[]),
  } as unknown as SupabaseServer;
}

const db = () => fakeDb(GYMS, DOMAINS);

// A `.from`-counting wrapper: every table read is one `from` call, so the spy count
// is the number of DB round trips a resolution actually spent — the observable the
// cache is meant to drive to zero on a hit.
function spyDb(gyms: GymRow[] = GYMS, domains: DomainRow[] = DOMAINS) {
  const base = fakeDb(gyms, domains) as unknown as { from: (t: string) => unknown };
  const from = vi.fn(base.from);
  return { client: { from } as unknown as SupabaseServer, from };
}

// Like spyDb, but the named table's FIRST `.maybeSingle()` resolves with a transient
// PostgREST error (data:null + error set) instead of a row; every later read succeeds.
// Models one DB blip so the "errors are not cached" contract is falsifiable via the spy.
function spyErringDb(errorTable: "gym" | "gym_domain") {
  let erred = false;
  const table = (rows: Record<string, unknown>[], name: string) => {
    let filtered = rows;
    const b = {
      select: () => b,
      eq: (col: string, val: unknown) => {
        filtered = filtered.filter((r) => r[col] === val);
        return b;
      },
      maybeSingle: () => {
        if (name === errorTable && !erred) {
          erred = true;
          return Promise.resolve({ data: null, error: { message: "transient" } });
        }
        return Promise.resolve({ data: filtered[0] ?? null, error: null });
      },
    };
    return b;
  };
  const from = vi.fn((t: string) =>
    table((t === "gym" ? GYMS : DOMAINS) as unknown as Record<string, unknown>[], t),
  );
  return { client: { from } as unknown as SupabaseServer, from };
}

// The cache is module-level (correct: host/slug→tenant is GLOBAL public mapping, not
// user data), so every case starts from an empty cache to stay isolated + falsifiable.
beforeEach(() => clearTenantCache());

describe("resolveTenant", () => {
  it("resolves a mapped host to its gym, port-stripped and case-insensitive", async () => {
    expect(await resolveTenant("red.localhost", null, db())).toEqual({
      id: "gym-red",
      slug: "red",
      brandModuleId: "red",
    });
    expect(await resolveTenant("RED.localhost:3000", null, db())).toMatchObject({ slug: "red" });
  });

  it("returns NO tenant for an unknown host with no override", async () => {
    expect(await resolveTenant("unmapped.example.com", null, db())).toBeNull();
    expect(await resolveTenant(null, null, db())).toBeNull();
  });

  it("honors a `?gym=` override naming a real gym slug on an unmapped host", async () => {
    expect(await resolveTenant("unmapped.example.com", "red", db())).toMatchObject({
      slug: "red",
      brandModuleId: "red",
    });
  });

  it("returns NO tenant when `?gym=` does not name a real gym slug", async () => {
    expect(await resolveTenant("unmapped.example.com", "banana", db())).toBeNull();
    expect(await resolveTenant("unmapped.example.com", "toString", db())).toBeNull();
  });

  it("lets the host win over a conflicting override (host-wins precedence)", async () => {
    expect(await resolveTenant("forge.localhost", "red", db())).toMatchObject({ slug: "forge" });
  });
});

// The perf hinge (PERF-LOOP.md hypothesis #3): a 60s in-process TTL cache over the
// host/slug→tenant reads, so repeat navigations for the same host/slug spend zero DB
// round trips. Resolution stays bit-identical; only the trip count changes.
describe("resolveTenant cache", () => {
  it("serves a repeat host resolution from cache — zero further DB reads", async () => {
    const { client, from } = spyDb();
    expect(await resolveTenant("red.localhost", null, client)).toMatchObject({ slug: "red" });
    const afterFirst = from.mock.calls.length; // gym_domain + gym = 2 trips
    expect(afterFirst).toBe(2);
    expect(await resolveTenant("red.localhost", null, client)).toMatchObject({ slug: "red" });
    expect(from.mock.calls.length).toBe(afterFirst); // no new trips
  });

  it("caches a NEGATIVE host result (unmapped host) — the local/dev case", async () => {
    const { client, from } = spyDb();
    expect(await resolveTenant("unmapped.example.com", null, client)).toBeNull();
    expect(from.mock.calls.length).toBe(1); // one gym_domain miss
    expect(await resolveTenant("unmapped.example.com", null, client)).toBeNull();
    expect(from.mock.calls.length).toBe(1); // negative cached, no re-query
  });

  it("caches a NEGATIVE slug result (?gym= naming no real gym)", async () => {
    const { client, from } = spyDb();
    expect(await resolveTenant("unmapped.example.com", "banana", client)).toBeNull();
    const afterFirst = from.mock.calls.length; // gym_domain miss + gym-by-slug miss = 2
    expect(afterFirst).toBe(2);
    expect(await resolveTenant("unmapped.example.com", "banana", client)).toBeNull();
    expect(from.mock.calls.length).toBe(afterFirst);
  });

  it("keeps host-wins precedence when both host and slug are cache-warm", async () => {
    const { client } = spyDb();
    // Warm the slug cache with a real "red" resolution on an unmapped host…
    expect(await resolveTenant("unmapped.example.com", "red", client)).toMatchObject({
      slug: "red",
    });
    // …then a mapped Forge host with ?gym=red must still resolve Forge (host wins).
    expect(await resolveTenant("forge.localhost", "red", client)).toMatchObject({ slug: "forge" });
  });

  it("re-resolves once the 60s TTL expires", async () => {
    vi.useFakeTimers();
    try {
      const { client, from } = spyDb();
      await resolveTenant("red.localhost", null, client);
      const afterFirst = from.mock.calls.length;
      vi.advanceTimersByTime(61_000);
      await resolveTenant("red.localhost", null, client);
      expect(from.mock.calls.length).toBe(afterFirst * 2); // TTL lapsed → fresh trips
    } finally {
      vi.useRealTimers();
    }
  });

  it("does NOT cache a transient HOST lookup error — the next call re-queries, then caches", async () => {
    const { client, from } = spyErringDb("gym_domain");
    // The gym_domain read errors → the request falls through to NO tenant, but nothing is cached.
    expect(await resolveTenant("red.localhost", null, client)).toBeNull();
    const afterErr = from.mock.calls.length; // 1 gym_domain read, no gym read (errored before it)
    expect(afterErr).toBe(1);
    // Not cached → this call re-queries and now succeeds (gym_domain + gym = 2 fresh trips).
    expect(await resolveTenant("red.localhost", null, client)).toMatchObject({ slug: "red" });
    const afterSuccess = from.mock.calls.length;
    expect(afterSuccess).toBe(afterErr + 2);
    // The successful resolution DID cache normally — no further trips.
    expect(await resolveTenant("red.localhost", null, client)).toMatchObject({ slug: "red" });
    expect(from.mock.calls.length).toBe(afterSuccess);
  });

  it("does NOT cache a transient SLUG lookup error — the next call re-queries, then caches", async () => {
    const { client, from } = spyErringDb("gym");
    // Unmapped host (a benign negative that DOES cache) + a `?gym=` slug whose read errors.
    expect(await resolveTenant("unmapped.example.com", "red", client)).toBeNull();
    const afterErr = from.mock.calls.length; // gym_domain miss (cached) + gym error (NOT cached) = 2
    expect(afterErr).toBe(2);
    // Only the slug read repeats (host stays cached); it now succeeds.
    expect(await resolveTenant("unmapped.example.com", "red", client)).toMatchObject({ slug: "red" });
    const afterSuccess = from.mock.calls.length;
    expect(afterSuccess).toBe(afterErr + 1);
    // The successful slug resolution cached — no further trips.
    expect(await resolveTenant("unmapped.example.com", "red", client)).toMatchObject({ slug: "red" });
    expect(from.mock.calls.length).toBe(afterSuccess);
  });

  it("bounds the cache — the oldest entry is evicted past the cap and re-resolves", async () => {
    const { client, from } = spyDb();
    await resolveTenant("a.localhost", null, client); // 1 trip, cached as oldest
    // Fill the host cache past its 500-entry cap so "a.localhost" is evicted (FIFO).
    for (let i = 0; i < 500; i++) {
      await resolveTenant(`fill-${i}.localhost`, null, client);
    }
    const beforeReResolve = from.mock.calls.length;
    await resolveTenant("a.localhost", null, client); // evicted → must re-query
    expect(from.mock.calls.length).toBe(beforeReResolve + 1);
  });
});

describe("tenantHeaders", () => {
  const tenant: Tenant = { id: "gym-red", slug: "red", brandModuleId: "red" };

  it("stamps x-gym (slug) + x-brand (module key) for a resolved tenant", () => {
    const h = tenantHeaders(new Headers(), tenant);
    expect(h.get("x-gym")).toBe("red");
    expect(h.get("x-brand")).toBe("red");
  });

  it("stamps NO x-gym and NO x-brand when there is no tenant (unknown host)", () => {
    const h = tenantHeaders(new Headers({ host: "unmapped.example.com" }), null);
    expect(h.get("x-gym")).toBeNull();
    expect(h.get("x-brand")).toBeNull();
  });

  it("preserves the base request headers", () => {
    const h = tenantHeaders(new Headers({ host: "red.localhost", cookie: "a=1" }), tenant);
    expect(h.get("host")).toBe("red.localhost");
    expect(h.get("cookie")).toBe("a=1");
  });
});
