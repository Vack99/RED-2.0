import { describe, expect, it } from "vitest";

import { isTelValido, telDigits, TEL_DIGITS } from "./format";

describe("isTelValido", () => {
  it("accepts exactly 10 digits (the canonical MX rule)", () => {
    expect(TEL_DIGITS).toBe(10);
    expect(isTelValido("6141234567")).toBe(true);
  });

  it("accepts formatted input that strips to 10 digits", () => {
    expect(telDigits("(614) 123-4567")).toBe("6141234567");
    expect(isTelValido("(614) 123-4567")).toBe(true);
  });

  it("rejects 9 digits", () => {
    expect(isTelValido("614123456")).toBe(false);
  });

  it("rejects 8 digits (the old >= 8 gate let these through)", () => {
    expect(isTelValido("61412345")).toBe(false);
  });

  it("rejects 11 digits", () => {
    expect(isTelValido("61412345678")).toBe(false);
  });

  it("rejects empty input", () => {
    expect(isTelValido("")).toBe(false);
  });
});
