import { describe, expect, it } from "vitest";

import { resolverDiaSesion } from "./resolver-sesion";

/**
 * `?sesion=<id>` → the day it lives on, within the loaded week only (#328). The
 * pure half of the deep link — page.tsx feeds it the loaded week's own id lists.
 */

const DIAS = [
  { iso: "2026-06-15", ids: ["a", "b"] },
  { iso: "2026-06-16", ids: [] },
  { iso: "2026-06-17", ids: ["c"] },
];

describe("resolverDiaSesion", () => {
  it("resolves an id to the day that carries it", () => {
    expect(resolverDiaSesion(DIAS, "b")).toBe("2026-06-15");
    expect(resolverDiaSesion(DIAS, "c")).toBe("2026-06-17");
  });

  it("ignores an id absent from every day in the loaded week (stale/foreign-week link)", () => {
    expect(resolverDiaSesion(DIAS, "unknown")).toBeNull();
  });

  it("ignores an undefined id (the ordinary /agenda visit, no ?sesion=)", () => {
    expect(resolverDiaSesion(DIAS, undefined)).toBeNull();
  });
});
