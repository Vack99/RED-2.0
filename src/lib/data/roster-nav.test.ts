import { describe, expect, it } from "vitest";

import { vecinosDe } from "./roster-nav";

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
