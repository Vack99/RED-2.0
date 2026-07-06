import { describe, expect, it } from "vitest";

import { rosterResumen } from "./session-roster";

/**
 * The roster headline: how many booked members are actually marked present out of
 * the whole list (booked + walk-ins). `present` is the only field that matters.
 */
describe("rosterResumen", () => {
  it("counts present against the full roster", () => {
    expect(rosterResumen([{ present: true }, { present: false }, { present: true }])).toEqual({ presentes: 2, total: 3 });
  });
  it("is zero/zero for an empty roster", () => {
    expect(rosterResumen([])).toEqual({ presentes: 0, total: 0 });
  });
  it("counts a fully-marked class", () => {
    expect(rosterResumen([{ present: true }, { present: true }])).toEqual({ presentes: 2, total: 2 });
  });
});
