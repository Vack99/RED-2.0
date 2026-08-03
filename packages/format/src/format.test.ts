import { describe, expect, it } from "vitest";

import { foldDiacritics, isEmailValido, isTelValido, telDigits, TEL_DIGITS } from "./format";

describe("foldDiacritics", () => {
  it("strips accents so an unaccented query matches an accented name (#224)", () => {
    expect(foldDiacritics("chavez")).toBe(foldDiacritics("Chávez"));
    expect(foldDiacritics("Chávez")).toBe("chavez");
  });

  it("folds NFC and NFD encodings of the same accented name to the same value (the real desk case: iOS/macOS clipboard paste yields NFD)", () => {
    const nfc = "Chávez"; // precomposed: U+00E1 ("á", a-with-acute) as one code point
    const nfd = "Chávez"; // decomposed: "a" (U+0061) + combining acute accent (U+0301)
    expect(nfc).not.toBe(nfd); // sanity: distinct JS strings before folding
    expect(foldDiacritics(nfc)).toBe(foldDiacritics(nfd));
    expect(foldDiacritics(nfc)).toBe("chavez");
  });

  it("folds other accented names (héctor -> hector)", () => {
    expect(foldDiacritics("Héctor")).toBe("hector");
    expect(foldDiacritics("hector")).toBe(foldDiacritics("Héctor"));
  });

  // ñ/ü fold too, not just acute/grave vowels -- deliberate, not an accident of
  // \p{Diacritic}: the desk operator types plain ASCII, so "munoz" must find "Muñoz"
  // and "aguero" must find "Agüero" exactly like the acute-accent cases above.
  it("folds ñ and ü for search (deliberate -- munoz must find Muñoz)", () => {
    expect(foldDiacritics("Muñoz")).toBe("munoz");
    expect(foldDiacritics("Peña")).toBe("pena");
    expect(foldDiacritics("Agüero")).toBe("aguero");
  });

  it("is case-insensitive independent of accents", () => {
    expect(foldDiacritics("CHÁVEZ")).toBe("chavez");
  });

  it("is a no-op on plain ASCII/digit text (phone search unaffected)", () => {
    expect(foldDiacritics("614-123-4567")).toBe("614-123-4567");
  });

  it("handles empty input", () => {
    expect(foldDiacritics("")).toBe("");
  });
});

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

describe("isEmailValido", () => {
  it("accepts a well-formed email", () => {
    expect(isEmailValido("socio@correo.mx")).toBe(true);
  });

  it("accepts leading/trailing whitespace", () => {
    expect(isEmailValido("  socio@correo.mx  ")).toBe(true);
  });

  it("rejects a missing @", () => {
    expect(isEmailValido("socio-correo.mx")).toBe(false);
  });

  it("rejects a missing domain dot", () => {
    expect(isEmailValido("socio@correo")).toBe(false);
  });

  it("rejects empty input", () => {
    expect(isEmailValido("")).toBe(false);
  });
});
