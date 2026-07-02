import { describe, expect, it } from "vitest";

import type { SupabaseServer } from "./supabase";
import { resolveTenant, tenantHeaders, type Tenant } from "./resolve-tenant";

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
