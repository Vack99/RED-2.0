import { describe, expect, it } from "vitest";

import { daySummaryLabel, weekSummaryLabel } from "./week-group";

describe("daySummaryLabel", () => {
  it("pluralizes clases and appends the occupancy percent", () => {
    expect(daySummaryLabel(6, 82)).toBe("6 clases · 82%");
  });
  it("uses the singular for one class", () => {
    expect(daySummaryLabel(1, 50)).toBe("1 clase · 50%");
  });
  it("drops the percent when occupancy is unknown", () => {
    expect(daySummaryLabel(3, null)).toBe("3 clases");
  });
  it("is empty for a day with no classes", () => {
    expect(daySummaryLabel(0, null)).toBe("");
  });
});

describe("weekSummaryLabel", () => {
  it("labels the week occupancy", () => {
    expect(weekSummaryLabel(78)).toBe("Semana · 78% ocupación");
  });
});
