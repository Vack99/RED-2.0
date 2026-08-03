import { afterEach, describe, expect, it, vi } from "vitest";

import type { OperatorGym } from "@gym/data/server/gym";

import { auditTenantInEffect, compareTenant } from "./tenant";

// The tenant-in-effect comparison (#203). `compareTenant` is pure, so the three-way
// branch is asserted directly; `auditTenantInEffect` needs the request headers, which
// is the only reason `next/headers` is stubbed here.
const stubbedHeaders = new Headers();
vi.mock("next/headers", () => ({ headers: async () => stubbedHeaders }));

function setHeaders(entries: Record<string, string>): void {
  for (const key of [...stubbedHeaders.keys()]) stubbedHeaders.delete(key);
  for (const [key, value] of Object.entries(entries)) stubbedHeaders.set(key, value);
}

const gym = (over: Partial<OperatorGym> = {}): OperatorGym => ({
  id: "gym-forge",
  timezone: "America/Chihuahua",
  slug: "forge",
  brandName: "Forge",
  userId: "op-1",
  ...over,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("compareTenant", () => {
  it("no x-gym → absent (previews, the bare .vercel.app, and plain `pnpm dev`)", () => {
    expect(compareTenant(null, "forge")).toBe("absent");
  });

  it("the host names the gym this session staffs → match", () => {
    expect(compareTenant("forge", "forge")).toBe("match");
  });

  it("the host names a DIFFERENT gym → crossing", () => {
    expect(compareTenant("red", "forge")).toBe("crossing");
  });

  // The empty string is what an `x-gym: ` header yields. It names no gym, so it is
  // absent, not a crossing — treating it as a crossing would refuse a request the
  // proxy never made a tenant claim about.
  it("an empty x-gym is absent, not a crossing", () => {
    expect(compareTenant("", "forge")).toBe("absent");
  });
});

describe("auditTenantInEffect", () => {
  it("logs ONE structured line on a crossing, carrying both gyms, the path and the user", async () => {
    setHeaders({ "x-gym": "red", "x-ruta": "/clientes" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await auditTenantInEffect(gym())).toBe("crossing");
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(warn.mock.calls[0][0] as string)).toEqual({
      event: "tenant-crossing",
      hostGym: "red",
      membershipGym: "forge",
      path: "/clientes",
      userId: "op-1",
    });
  });

  it("logs NOTHING when the host and the membership agree (no per-request noise)", async () => {
    setHeaders({ "x-gym": "forge", "x-ruta": "/inicio" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await auditTenantInEffect(gym())).toBe("match");
    expect(warn).not.toHaveBeenCalled();
  });

  it("logs NOTHING when no tenant resolved — an unmapped host is not a crossing", async () => {
    setHeaders({ "x-ruta": "/inicio" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await auditTenantInEffect(gym())).toBe("absent");
    expect(warn).not.toHaveBeenCalled();
  });

  // proxy.ts stamps x-ruta, but the line must still be emitted (and parseable) if some
  // future entry point forwards a request without it — a crossing is worth more than
  // the path it happened on.
  it("still logs the crossing when x-ruta is absent", async () => {
    setHeaders({ "x-gym": "red" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await auditTenantInEffect(gym())).toBe("crossing");
    expect(JSON.parse(warn.mock.calls[0][0] as string).path).toBeNull();
  });
});
