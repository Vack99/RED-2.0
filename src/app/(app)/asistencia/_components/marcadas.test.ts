import { describe, expect, it } from "vitest";

import { setMarcada, type Marcadas } from "./marcadas";

describe("setMarcada", () => {
  it("adds an id to an empty day", () => {
    const next = setMarcada({}, "2026-06-05", "c1", true);
    expect(next).toEqual({ "2026-06-05": ["c1"] });
  });

  it("removes an id from a populated day", () => {
    const cur: Marcadas = { "2026-06-05": ["c1", "c2"] };
    const next = setMarcada(cur, "2026-06-05", "c1", false);
    expect(next).toEqual({ "2026-06-05": ["c2"] });
  });

  it("is idempotent when adding an id already present (no duplicate)", () => {
    const cur: Marcadas = { "2026-06-05": ["c1"] };
    const next = setMarcada(cur, "2026-06-05", "c1", true);
    expect(next["2026-06-05"]).toEqual(["c1"]);
  });

  it("is idempotent when removing an id that is absent", () => {
    const cur: Marcadas = { "2026-06-05": ["c2"] };
    const next = setMarcada(cur, "2026-06-05", "c1", false);
    expect(next["2026-06-05"]).toEqual(["c2"]);
  });

  it("does not mutate the input map or its day array", () => {
    const day = ["c1"];
    const cur: Marcadas = { "2026-06-05": day };
    const next = setMarcada(cur, "2026-06-05", "c2", true);
    expect(cur["2026-06-05"]).toBe(day);
    expect(day).toEqual(["c1"]);
    expect(next).not.toBe(cur);
  });

  it("leaves other days untouched", () => {
    const cur: Marcadas = { "2026-06-04": ["c9"], "2026-06-05": ["c1"] };
    const next = setMarcada(cur, "2026-06-05", "c2", true);
    expect(next["2026-06-04"]).toBe(cur["2026-06-04"]);
  });

  it("reconcile to the same desired state as the optimistic flip is a no-op-equivalent", () => {
    // Optimistic flip ON, then server confirms present:true → identical set.
    const optimistic = setMarcada({ "2026-06-05": [] }, "2026-06-05", "c1", true);
    const reconciled = setMarcada(optimistic, "2026-06-05", "c1", true);
    expect(reconciled["2026-06-05"]).toEqual(["c1"]);
  });
});
