import { describe, expect, it } from "vitest";

import { getVecinos, vecinosDe } from "./roster-nav";
import { makeFake } from "./supabase-fake.test-helper";

const IDS = ["a", "b", "c", "d"]; // a stable browse-all name order

describe("vecinosDe", () => {
  it("returns both neighbors for a middle element", () => {
    expect(vecinosDe(IDS, "b")).toEqual({ prevId: "a", nextId: "c" });
  });

  it("has no prev for the first element", () => {
    expect(vecinosDe(IDS, "a")).toEqual({ prevId: null, nextId: "b" });
  });

  it("has no next for the last element", () => {
    expect(vecinosDe(IDS, "d")).toEqual({ prevId: "c", nextId: null });
  });

  it("returns both null for a single-element list", () => {
    expect(vecinosDe(["only"], "only")).toEqual({ prevId: null, nextId: null });
  });

  it("returns both null when the target is not in the list", () => {
    expect(vecinosDe(IDS, "z")).toEqual({ prevId: null, nextId: null });
  });

  it("returns both null for an empty list", () => {
    expect(vecinosDe([], "a")).toEqual({ prevId: null, nextId: null });
  });
});

/**
 * The seam this exercises: `getVecinos` takes an injectable client (ADR-0001), so
 * its read ORCHESTRATION — paginating the ordered roster so neighbors stay correct
 * past PostgREST's ~1000-row cap (the un-paginated read the health gate flagged as a
 * silent-truncation hard-fail) — is testable with the chain-capturing fake. The fake
 * preserves seed order (`.order()` is a no-op) and slices on `.range()`, so the seeded
 * array IS the browse-all name order.
 */
describe("getVecinos — paginated ordered-id roster (injected fake)", () => {
  it("paginates past the cap and returns correct neighbors across the page boundary", async () => {
    // 1001 clients, one past the PAGE (1000) cap; cli-1000 lives only on page 2.
    const clientes = Array.from({ length: 1001 }, (_, i) => ({ id: `cli-${i}` }));
    const { client, rangeCalls } = makeFake({ clientes });

    // neighbor straddling the page boundary: an un-paginated read would drop cli-1000.
    expect(await getVecinos("cli-999", client)).toEqual({
      prevId: "cli-998",
      nextId: "cli-1000",
    });
    // it paged: full first page [0,999] then the short second page [1000,1999] (1 row).
    expect(rangeCalls["clientes"]).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("returns the adjacent ids in browse-all order for a small roster", async () => {
    const { client } = makeFake({ clientes: [{ id: "a" }, { id: "b" }, { id: "c" }] });
    expect(await getVecinos("b", client)).toEqual({ prevId: "a", nextId: "c" });
  });

  it("scopes the roster walk to the operator's gym on every page (§1.1; audit 2026-07-13)", async () => {
    const clientes = Array.from({ length: 1001 }, (_, i) => ({ id: `cli-${i}` }));
    const { client, eqCalls } = makeFake({ clientes });
    await getVecinos("cli-0", client);
    // Both pagination pages carry the scope selector.
    expect(eqCalls["clientes"]).toEqual([
      ["gym_id", "test-gym"],
      ["gym_id", "test-gym"],
    ]);
  });
});
