import { afterEach, describe, expect, it, vi } from "vitest";

import type { OperatorGym } from "@gym/data/server/gym";

import { auditTenantInEffect, decideTenant } from "./tenant";

// The tenant-in-effect reconciliation (#203/#212). `decideTenant` is pure, so the four
// arms are asserted directly; `auditTenantInEffect` needs the request headers, which is
// the only reason `next/headers` is stubbed here.
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
  bookingEnabled: false,
  userId: "op-1",
  ...over,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("decideTenant", () => {
  it("no x-gym → render my first gym (previews, the bare .vercel.app, and plain `pnpm dev`)", () => {
    expect(decideTenant(null, ["forge"])).toEqual({ kind: "render", gym: "forge" });
  });

  // The empty string is what an `x-gym: ` header yields. It names no gym, so it renders
  // like an absent tenant — refusing it would act on a claim the proxy never made.
  it("an empty x-gym renders too, it is not a crossing", () => {
    expect(decideTenant("", ["forge"])).toEqual({ kind: "render", gym: "forge" });
  });

  it("the host names a gym this session staffs → render THAT gym, not the first one", () => {
    expect(decideTenant("red", ["forge", "red"])).toEqual({ kind: "render", gym: "red" });
  });

  it("one staff gym + the host names another → redirect to mine", () => {
    expect(decideTenant("red", ["forge"])).toEqual({ kind: "redirect", gym: "forge" });
  });

  it("2+ staff gyms + the host names none → choose (no single correct target to guess)", () => {
    expect(decideTenant("otro", ["forge", "red"])).toEqual({ kind: "choose" });
  });

  it("no staff gym at all → none, host or no host", () => {
    expect(decideTenant("red", [])).toEqual({ kind: "none" });
    expect(decideTenant(null, [])).toEqual({ kind: "none" });
  });
});

describe("auditTenantInEffect", () => {
  it("logs ONE structured line on a crossing, carrying both gyms, the path, the user and the outcome", async () => {
    setHeaders({ "x-gym": "red", "x-ruta": "/clientes" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await auditTenantInEffect([gym()])).toEqual({ kind: "redirect", gym: "forge" });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(warn.mock.calls[0][0] as string)).toEqual({
      event: "tenant-crossing",
      hostGym: "red",
      membershipGyms: ["forge"],
      path: "/clientes",
      userId: "op-1",
      outcome: "redirect",
    });
  });

  it("names the `choose` outcome when the operator staffs 2+ gyms and the host names none", async () => {
    setHeaders({ "x-gym": "otro", "x-ruta": "/inicio" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await auditTenantInEffect([gym(), gym({ slug: "red" })])).toEqual({ kind: "choose" });
    expect(JSON.parse(warn.mock.calls[0][0] as string)).toMatchObject({
      membershipGyms: ["forge", "red"],
      outcome: "choose",
    });
  });

  it("logs NOTHING when the host and the membership agree (no per-request noise)", async () => {
    setHeaders({ "x-gym": "forge", "x-ruta": "/inicio" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await auditTenantInEffect([gym()])).toEqual({ kind: "render", gym: "forge" });
    expect(warn).not.toHaveBeenCalled();
  });

  it("logs NOTHING when no tenant resolved — an unmapped host is not a crossing", async () => {
    setHeaders({ "x-ruta": "/inicio" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await auditTenantInEffect([gym()])).toEqual({ kind: "render", gym: "forge" });
    expect(warn).not.toHaveBeenCalled();
  });

  it("logs NOTHING for a session that staffs no gym — there is no tenant to cross into", async () => {
    setHeaders({ "x-gym": "red", "x-ruta": "/inicio" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await auditTenantInEffect([])).toEqual({ kind: "none" });
    expect(warn).not.toHaveBeenCalled();
  });

  // proxy.ts stamps x-ruta, but the line must still be emitted (and parseable) if some
  // future entry point forwards a request without it — a crossing is worth more than
  // the path it happened on.
  it("still logs the crossing when x-ruta is absent", async () => {
    setHeaders({ "x-gym": "red" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(await auditTenantInEffect([gym()])).toEqual({ kind: "redirect", gym: "forge" });
    expect(JSON.parse(warn.mock.calls[0][0] as string).path).toBeNull();
  });
});
