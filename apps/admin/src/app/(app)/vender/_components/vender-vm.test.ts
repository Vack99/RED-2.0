import { describe, expect, it } from "vitest";

import { clienteListo, telError } from "./vender-vm";

describe("telError — inline NUEVO phone error (#48)", () => {
  it("is null at 0 digits while unblurred (nothing typed yet)", () => {
    expect(telError("", false)).toBeNull();
    expect(telError("(", false)).toBeNull();
  });

  it("is null for a complete 10-digit number regardless of blur", () => {
    expect(telError("614 218 3401", false)).toBeNull();
    expect(telError("614 218 3401", true)).toBeNull();
  });

  it("errors at 11+ digits immediately, blurred or not", () => {
    expect(telError("614 218 34012", false)).toBe("El teléfono debe tener 10 dígitos.");
    expect(telError("614 218 34012", true)).toBe("El teléfono debe tener 10 dígitos.");
  });

  it("errors on a partial 1–9 digits ONLY once blurred", () => {
    expect(telError("614 218", false)).toBeNull();
    expect(telError("614 218", true)).toBe("El teléfono debe tener 10 dígitos.");
    expect(telError("6", true)).toBe("El teléfono debe tener 10 dígitos.");
  });
});

describe("clienteListo — CONTINUAR enablement (email can never gate)", () => {
  it("is true for a ≥3-char name + valid tel, even with no email", () => {
    expect(clienteListo("new", "Ana", "614 218 3401", false)).toBe(true);
  });

  it("is false below the 3-char name boundary", () => {
    expect(clienteListo("new", "An", "614 218 3401", false)).toBe(false);
  });

  it("tracks the 10-digit tel boundary (9 / 10 / 11 digits)", () => {
    expect(clienteListo("new", "Ana", "614 218 340", false)).toBe(false); // 9
    expect(clienteListo("new", "Ana", "614 218 3401", false)).toBe(true); // 10
    expect(clienteListo("new", "Ana", "614 218 34012", false)).toBe(false); // 11
  });

  it("EXISTENTE depends only on a picked client (name/tel ignored)", () => {
    expect(clienteListo("existing", "", "", true)).toBe(true);
    expect(clienteListo("existing", "Ana", "614 218 3401", false)).toBe(false);
  });
});
