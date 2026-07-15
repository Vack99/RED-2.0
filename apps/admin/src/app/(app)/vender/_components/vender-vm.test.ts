import { describe, expect, it } from "vitest";

import {
  clienteListo,
  CUSTOM_VACIO,
  customErrors,
  customSeleccion,
  customValido,
  inicioEfectivo,
  inicioMinIso,
  paqueteListo,
  PERSONALIZADO,
  precioSeleccionado,
  telError,
} from "./vender-vm";

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

describe("inicioMinIso — the backdate picker floor (spec D6)", () => {
  const HOY = "2026-07-14";

  it("is today − 30 for a NUEVO sale (no alta yet)", () => {
    expect(inicioMinIso(HOY, null)).toBe("2026-06-14");
  });

  it("is today − 30 when the client's alta is older than the 30-day cap", () => {
    expect(inicioMinIso(HOY, "2026-01-01")).toBe("2026-06-14");
  });

  it("raises to the alta when the client was created inside the 30-day window", () => {
    expect(inicioMinIso(HOY, "2026-07-10")).toBe("2026-07-10");
  });

  it("uses the alta exactly on the boundary day", () => {
    expect(inicioMinIso(HOY, "2026-06-14")).toBe("2026-06-14"); // == floor, either is fine
    expect(inicioMinIso(HOY, "2026-06-15")).toBe("2026-06-15"); // one day inside → alta wins
  });
});

describe("inicioEfectivo — clamp the pick + report backdate (spec D6)", () => {
  const HOY = "2026-07-14";

  it("today's pick is not a backdate", () => {
    expect(inicioEfectivo(HOY, HOY, null)).toEqual({ iso: HOY, backdate: false });
  });

  it("an in-range past pick is a backdate", () => {
    expect(inicioEfectivo("2026-07-01", HOY, null)).toEqual({ iso: "2026-07-01", backdate: true });
  });

  it("a future pick reverts to today (never a forward-dated sale)", () => {
    expect(inicioEfectivo("2026-07-20", HOY, null)).toEqual({ iso: HOY, backdate: false });
  });

  it("a pick below the alta floor reverts to today (client changed after picking)", () => {
    // alta 10 jul raises the floor; a 05-jul pick is now out of range → today.
    expect(inicioEfectivo("2026-07-05", HOY, "2026-07-10")).toEqual({ iso: HOY, backdate: false });
  });

  it("a pick past the 30-day cap reverts to today", () => {
    expect(inicioEfectivo("2026-05-01", HOY, null)).toEqual({ iso: HOY, backdate: false });
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

const lleno = { nombre: "Promo Verano", precio: "750", clases: "12", ilimitado: false, dias: "45" };
const todoBlurred = { nombre: true, precio: true, clases: true, dias: true };

describe("customErrors", () => {
  it("has no errors for a complete, in-bounds form", () => {
    expect(customErrors(lleno, todoBlurred)).toEqual({ nombre: null, precio: null, clases: null, dias: null });
  });

  it("stays quiet on empty untouched fields", () => {
    expect(customErrors(CUSTOM_VACIO, {})).toEqual({ nombre: null, precio: null, clases: null, dias: null });
  });

  it("flags an empty required field once blurred", () => {
    expect(customErrors(CUSTOM_VACIO, todoBlurred).nombre).not.toBeNull();
  });

  it("rejects a name shorter than 3 characters", () => {
    expect(customErrors({ ...lleno, nombre: "ab" }, todoBlurred).nombre).not.toBeNull();
  });

  it("rejects a name longer than 40 characters", () => {
    expect(customErrors({ ...lleno, nombre: "x".repeat(41) }, todoBlurred).nombre).not.toBeNull();
  });

  it("rejects a price of zero and a price above 100000", () => {
    expect(customErrors({ ...lleno, precio: "0" }, todoBlurred).precio).not.toBeNull();
    expect(customErrors({ ...lleno, precio: "100001" }, todoBlurred).precio).not.toBeNull();
  });

  it("rejects non-numeric and non-integer input", () => {
    expect(customErrors({ ...lleno, precio: "abc" }, todoBlurred).precio).not.toBeNull();
    expect(customErrors({ ...lleno, precio: "750.5" }, todoBlurred).precio).not.toBeNull();
  });

  it("rejects classes outside 1-365", () => {
    expect(customErrors({ ...lleno, clases: "0" }, todoBlurred).clases).not.toBeNull();
    expect(customErrors({ ...lleno, clases: "366" }, todoBlurred).clases).not.toBeNull();
  });

  it("ignores the classes field entirely when ilimitado is on", () => {
    expect(customErrors({ ...lleno, ilimitado: true, clases: "" }, todoBlurred).clases).toBeNull();
  });

  it("rejects vigencia outside 1-365", () => {
    expect(customErrors({ ...lleno, dias: "0" }, todoBlurred).dias).not.toBeNull();
    expect(customErrors({ ...lleno, dias: "366" }, todoBlurred).dias).not.toBeNull();
  });
});

describe("paqueteListo", () => {
  it("is true for any picked registered plan", () => {
    expect(paqueteListo("p-1", CUSTOM_VACIO)).toBe(true);
  });
  it("is false with nothing picked", () => {
    expect(paqueteListo(null, CUSTOM_VACIO)).toBe(false);
  });
  it("is false on the custom tile until the form validates", () => {
    expect(paqueteListo(PERSONALIZADO, CUSTOM_VACIO)).toBe(false);
    expect(paqueteListo(PERSONALIZADO, lleno)).toBe(true);
  });
});

describe("precioSeleccionado", () => {
  it("reads the plan's price for a registered plan", () => {
    expect(precioSeleccionado("p-1", 900, CUSTOM_VACIO)).toBe(900);
  });
  it("reads the typed price for a valid custom package", () => {
    expect(precioSeleccionado(PERSONALIZADO, null, lleno)).toBe(750);
  });
  it("is null for an incomplete custom package, so the footer shows a dash", () => {
    expect(precioSeleccionado(PERSONALIZADO, null, CUSTOM_VACIO)).toBeNull();
  });
});

describe("customSeleccion", () => {
  it("builds the wire payload with a finite class grant", () => {
    expect(customSeleccion(lleno)).toEqual({
      tipo: "personalizado", nombre: "Promo Verano", precio: 750, clases: 12, dias: 45,
    });
  });
  it("sends clases: null for ilimitado", () => {
    expect(customSeleccion({ ...lleno, ilimitado: true, clases: "" }).clases).toBeNull();
  });
  it("trims the name", () => {
    expect(customSeleccion({ ...lleno, nombre: "  Promo Verano  " }).nombre).toBe("Promo Verano");
  });
});

// customValido is exercised indirectly through paqueteListo/precioSeleccionado above;
// this covers it directly per the module's documented COBRAR-gate contract.
describe("customValido", () => {
  it("is false for the empty form and true for a complete, in-bounds one", () => {
    expect(customValido(CUSTOM_VACIO)).toBe(false);
    expect(customValido(lleno)).toBe(true);
  });
});
