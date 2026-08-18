import { beforeEach, describe, expect, it, vi } from "vitest";

import type { SupabaseServer } from "./supabase";
import {
  clearTenantCache,
  fetchTokenOverrides,
  resolveTenant,
  tenantHeaders,
  type Tenant,
} from "./resolve-tenant";

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

// Minimal fake of the client. The `gym` arm is a `.select().eq().maybeSingle()` chain
// resolving the first seeded row; the HOST arm is `.rpc("gym_id_por_host")` — since #216
// `gym_domain` is no longer anon-readable, so resolution goes through the SECURITY
// DEFINER projection instead of a table read.
function hostRpc(domains: DomainRow[]) {
  return (_fn: string, args: { p_hostname: string }) =>
    Promise.resolve({
      data: domains.find((d) => d.hostname === args.p_hostname)?.gym_id ?? null,
      error: null,
    });
}

function fakeDb(gyms: GymRow[], domains: DomainRow[]): SupabaseServer {
  return {
    from: () => gymTable(gyms as unknown as Record<string, unknown>[]),
    rpc: hostRpc(domains),
  } as unknown as SupabaseServer;
}

function gymTable(rows: Record<string, unknown>[], erring?: { erred: boolean }) {
  let filtered = rows;
  const b = {
    select: () => b,
    eq: (col: string, val: unknown) => {
      filtered = filtered.filter((r) => r[col] === val);
      return b;
    },
    maybeSingle: () => {
      if (erring && !erring.erred) {
        erring.erred = true;
        return Promise.resolve({ data: null, error: { message: "transient" } });
      }
      return Promise.resolve({ data: filtered[0] ?? null, error: null });
    },
  };
  return b;
}

const db = () => fakeDb(GYMS, DOMAINS);

// A round-trip counter. Both arms cost one trip — the `gym` read is a `from`, the host
// read is an `rpc` — so `trips` is the number of DB round trips a resolution actually
// spent: the observable the cache is meant to drive to zero on a hit.
function spyDb(gyms: GymRow[] = GYMS, domains: DomainRow[] = DOMAINS) {
  const from = vi.fn(() => gymTable(gyms as unknown as Record<string, unknown>[]));
  const rpcImpl = hostRpc(domains);
  const rpc = vi.fn(rpcImpl);
  const trips = { get mock() { return { calls: [...from.mock.calls, ...rpc.mock.calls] }; } };
  return { client: { from, rpc } as unknown as SupabaseServer, from: trips };
}

// Like spyDb, but the named arm's FIRST call resolves with a transient PostgREST error
// (data:null + error set) instead of a row; every later read succeeds. Models one DB blip
// so the "errors are not cached" contract is falsifiable via the counter.
function spyErringDb(errorArm: "gym" | "gym_domain") {
  const gymErring = errorArm === "gym" ? { erred: false } : undefined;
  let hostErred = errorArm === "gym_domain" ? false : true;
  const from = vi.fn(() => gymTable(GYMS as unknown as Record<string, unknown>[], gymErring));
  const base = hostRpc(DOMAINS);
  const rpc = vi.fn((fn: string, args: { p_hostname: string }) => {
    if (!hostErred) {
      hostErred = true;
      return Promise.resolve({ data: null, error: { message: "transient" } });
    }
    return base(fn, args);
  });
  const trips = { get mock() { return { calls: [...from.mock.calls, ...rpc.mock.calls] }; } };
  return { client: { from, rpc } as unknown as SupabaseServer, from: trips };
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

// App-scoped host resolution (#275): `gym_domain.app` is `not null check (app in
// ('admin','client'))` — every row IS scoped, there is no NULL-app row at the DB
// layer. The canonical RPC's `(p_app is null or d.app = p_app)` therefore means: a
// caller that DECLARES its app identity only matches rows scoped to that same app
// (`gym_id_por_host.sql`); a caller that declares NO identity (`p_app` null, the
// two proxies' sibling call sites this ticket leaves alone) matches ANY row
// regardless of its scope — that is the "permissive default" the ticket names.
describe("resolveTenant app scoping (#275)", () => {
  type ScopedDomainRow = { hostname: string; gym_id: string; app: "admin" | "client" };

  const SCOPED_DOMAINS: ScopedDomainRow[] = [
    { hostname: "admin-only.localhost", gym_id: "gym-red", app: "admin" },
    { hostname: "client-only.localhost", gym_id: "gym-forge", app: "client" },
  ];

  function scopedHostRpc(domains: ScopedDomainRow[]) {
    return (_fn: string, args: { p_hostname: string; p_app: "admin" | "client" | null }) => {
      const row = domains.find(
        (d) => d.hostname === args.p_hostname && (args.p_app === null || d.app === args.p_app),
      );
      return Promise.resolve({ data: row?.gym_id ?? null, error: null });
    };
  }

  function scopedDb() {
    return {
      from: () => gymTable(GYMS as unknown as Record<string, unknown>[]),
      rpc: scopedHostRpc(SCOPED_DOMAINS),
    } as unknown as SupabaseServer;
  }

  function spyScopedDb() {
    const from = vi.fn(() => gymTable(GYMS as unknown as Record<string, unknown>[]));
    const rpc = vi.fn(scopedHostRpc(SCOPED_DOMAINS));
    return { client: { from, rpc } as unknown as SupabaseServer, rpc };
  }

  it("passes the declared app identity as p_app on the RPC call", async () => {
    const { client, rpc } = spyScopedDb();
    await resolveTenant("admin-only.localhost", null, client, "admin");
    expect(rpc).toHaveBeenCalledWith("gym_id_por_host", {
      p_hostname: "admin-only.localhost",
      p_app: "admin",
    });
  });

  it("resolves a matching-app hostname", async () => {
    expect(
      await resolveTenant("admin-only.localhost", null, scopedDb(), "admin"),
    ).toMatchObject({ slug: "red" });
    expect(
      await resolveTenant("client-only.localhost", null, scopedDb(), "client"),
    ).toMatchObject({ slug: "forge" });
  });

  it("does NOT resolve a hostname scoped to the other app", async () => {
    expect(await resolveTenant("admin-only.localhost", null, scopedDb(), "client")).toBeNull();
    expect(await resolveTenant("client-only.localhost", null, scopedDb(), "admin")).toBeNull();
  });

  it("no declared app → p_app null → resolves regardless of the row's scope (permissive default)", async () => {
    const { client, rpc } = spyScopedDb();
    expect(await resolveTenant("admin-only.localhost", null, client)).toMatchObject({
      slug: "red",
    });
    expect(rpc).toHaveBeenCalledWith("gym_id_por_host", {
      p_hostname: "admin-only.localhost",
      p_app: null,
    });
  });

  it("caches per app identity — an admin-scoped resolution is never served to a client-arm call for the same hostname", async () => {
    const { client, rpc } = spyScopedDb();
    await resolveTenant("admin-only.localhost", null, client, "admin");
    expect(rpc.mock.calls.length).toBe(1);
    // Same hostname, different app identity → must NOT be a cache hit: a fresh RPC
    // call happens, and it correctly resolves to NO tenant (host is admin-scoped).
    expect(await resolveTenant("admin-only.localhost", null, client, "client")).toBeNull();
    expect(rpc.mock.calls.length).toBe(2);
  });
});

// fetchTokenOverrides is the `gym.token_overrides` read `brandCss` merges onto the
// module baseline (grill (b)). Same TTL-cache discipline as hostCache/slugCache
// (positive + negative caching; a transient error is returned but never cached).
describe("fetchTokenOverrides", () => {
  const OVERRIDES_ROW = {
    id: "gym-red",
    slug: "red",
    brand_module_id: "red",
    token_overrides: { light: { yellow: "#111111" } },
  } as unknown as Record<string, unknown>;

  it("returns the row's token_overrides", async () => {
    const client = { from: () => gymTable([OVERRIDES_ROW]) } as unknown as SupabaseServer;
    expect(await fetchTokenOverrides("red", client)).toEqual({ light: { yellow: "#111111" } });
  });

  it("serves a repeat call from cache within the TTL — zero further DB reads", async () => {
    const from = vi.fn(() => gymTable([OVERRIDES_ROW]));
    const client = { from } as unknown as SupabaseServer;
    expect(await fetchTokenOverrides("red", client)).toEqual({ light: { yellow: "#111111" } });
    expect(from.mock.calls.length).toBe(1);
    expect(await fetchTokenOverrides("red", client)).toEqual({ light: { yellow: "#111111" } });
    expect(from.mock.calls.length).toBe(1); // cache hit, no new trip
  });

  it("an unknown slug resolves to undefined, and that miss is cached", async () => {
    const from = vi.fn(() => gymTable([]));
    const client = { from } as unknown as SupabaseServer;
    expect(await fetchTokenOverrides("banana", client)).toBeUndefined();
    expect(from.mock.calls.length).toBe(1);
    expect(await fetchTokenOverrides("banana", client)).toBeUndefined();
    expect(from.mock.calls.length).toBe(1); // negative cached, no re-query
  });

  it("a transient error resolves to undefined for this request but is NOT cached", async () => {
    const erring = { erred: false };
    const from = vi.fn(() => gymTable([OVERRIDES_ROW], erring));
    const client = { from } as unknown as SupabaseServer;
    expect(await fetchTokenOverrides("red", client)).toBeUndefined();
    expect(from.mock.calls.length).toBe(1);
    // Not cached → the next call re-queries and now succeeds.
    expect(await fetchTokenOverrides("red", client)).toEqual({ light: { yellow: "#111111" } });
    expect(from.mock.calls.length).toBe(2);
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

  // The forged-header arm. `new Headers(base)` copies what the CLIENT sent, so
  // without an explicit delete an inbound x-gym/x-brand rides into the app on every
  // host that resolves no tenant (previews, the bare .vercel.app, `pnpm dev`). The
  // admin app is about to read x-gym to reconcile it against membership (#204/#212);
  // that read is only sound if the header can never be caller-supplied.
  it("a resolved tenant OVERWRITES an inbound x-gym/x-brand", () => {
    const h = tenantHeaders(new Headers({ "x-gym": "forge", "x-brand": "forge" }), tenant);
    expect(h.get("x-gym")).toBe("red");
    expect(h.get("x-brand")).toBe("red");
  });

  it("no tenant DELETES an inbound x-gym/x-brand rather than letting it through", () => {
    const h = tenantHeaders(new Headers({ "x-gym": "red", "x-brand": "red" }), null);
    expect(h.get("x-gym")).toBeNull();
    expect(h.get("x-brand")).toBeNull();
  });
});
