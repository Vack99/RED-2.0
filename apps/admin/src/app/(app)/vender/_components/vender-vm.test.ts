import { describe, expect, it } from "vitest";

import {
  clienteListo,
  CUSTOM_VACIO,
  customErrors,
  customSeleccion,
  customValido,
  emailError,
  inicioEfectivo,
  inicioMinIso,
  paqueteListo,
  PERSONALIZADO,
  pickerCoincide,
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

describe("inicioMinIso — the backdate picker floor (spec D6; alta floor dropped 2026-08-14)", () => {
  const HOY = "2026-07-14";

  it("is always today − 30, NEW or EXISTENTE alike (the alta floor was dropped)", () => {
    expect(inicioMinIso(HOY)).toBe("2026-06-14");
  });
});

describe("inicioEfectivo — clamp the pick + report backdate (spec D6)", () => {
  const HOY = "2026-07-14";

  it("today's pick is not a backdate", () => {
    expect(inicioEfectivo(HOY, HOY)).toEqual({ iso: HOY, backdate: false });
  });

  it("an in-range past pick is a backdate", () => {
    expect(inicioEfectivo("2026-07-01", HOY)).toEqual({ iso: "2026-07-01", backdate: true });
  });

  it("a future pick reverts to today (never a forward-dated sale)", () => {
    expect(inicioEfectivo("2026-07-20", HOY)).toEqual({ iso: HOY, backdate: false });
  });

  it("a pick past the 30-day cap reverts to today", () => {
    expect(inicioEfectivo("2026-05-01", HOY)).toEqual({ iso: HOY, backdate: false });
  });
});

describe("emailError — inline email error (the ñ a desk operator typed)", () => {
  it("stays quiet while a half-typed ASCII address is still being typed", () => {
    expect(emailError("Ivanmonta", false)).toBeNull();
    expect(emailError("maria@", false)).toBeNull();
  });

  it("names a half-typed ASCII address once the field is left", () => {
    expect(emailError("maria@", true)).toBe("Correo inválido");
  });

  // Blur cannot be the only trigger: ClienteEditor unmounts on accordion collapse (the flag
  // re-seeds to false), and a tap on the already-disabled COBRAR fires no blur — so the one
  // error the operator can NEVER type their way out of must show on sight.
  it("names a non-ASCII address ON SIGHT, blurred or not", () => {
    expect(emailError("Ivanmontañez77@gmail.com", false)).toBe("Correo inválido");
    expect(emailError("Ivanmontañez77@gmail.com", true)).toBe("Correo inválido");
  });

  it("stays null for an empty field — no email is always allowed", () => {
    expect(emailError("", true)).toBeNull();
    expect(emailError("   ", true)).toBeNull();
  });

  it("stays null for a deliverable address", () => {
    expect(emailError("Ivanmontanez77@gmail.com", true)).toBeNull();
  });
});

describe("clienteListo — CONTINUAR enablement (a MISSING email never gates, a bad one does)", () => {
  it("is true for a ≥3-char name + valid tel, even with no email", () => {
    expect(clienteListo("new", "Ana", "614 218 3401", false, "")).toBe(true);
  });

  it("is false below the 3-char name boundary", () => {
    expect(clienteListo("new", "An", "614 218 3401", false, "")).toBe(false);
  });

  it("tracks the 10-digit tel boundary (9 / 10 / 11 digits)", () => {
    expect(clienteListo("new", "Ana", "614 218 340", false, "")).toBe(false); // 9
    expect(clienteListo("new", "Ana", "614 218 3401", false, "")).toBe(true); // 10
    expect(clienteListo("new", "Ana", "614 218 34012", false, "")).toBe(false); // 11
  });

  it("accepts a blank tel — the phone is optional (#190)", () => {
    expect(clienteListo("new", "Ana", "", false, "")).toBe(true);
    expect(clienteListo("new", "Ana", "  ", false, "")).toBe(true);
  });

  it("EXISTENTE depends only on a picked client (name/tel ignored)", () => {
    expect(clienteListo("existing", "", "", true, "")).toBe(true);
    expect(clienteListo("existing", "Ana", "614 218 3401", false, "")).toBe(false);
  });

  it("blocks a NUEVO sale carrying a non-ASCII email (Resend can never deliver it)", () => {
    expect(clienteListo("new", "Ana", "614 218 3401", false, "Ivanmontañez77@gmail.com")).toBe(false);
    expect(clienteListo("new", "Ana", "614 218 3401", false, "Ivanmontanez77@gmail.com")).toBe(true);
  });

  it("blocks an EXISTENTE renewal whose C7 backfill email is undeliverable", () => {
    expect(clienteListo("existing", "", "", true, "correo@español.mx")).toBe(false);
    expect(clienteListo("existing", "", "", true, "correo@espanol.mx")).toBe(true);
  });

  it("a blank/whitespace email still never gates either door (§3.4)", () => {
    expect(clienteListo("new", "Ana", "", false, "   ")).toBe(true);
    expect(clienteListo("existing", "", "", true, "   ")).toBe(true);
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

describe("pickerCoincide — client-picker search predicate (#239 tel-arm digit guard)", () => {
  const ana = { nombre: "Ana López", tel: "6141234567" };
  const beto = { nombre: "Beto Ruiz", tel: "6149876543" };

  it("a letters-only query matches by name only — never falls through to every phone", () => {
    expect(pickerCoincide(ana, "ana")).toBe(true);
    expect(pickerCoincide(beto, "ana")).toBe(false);
  });

  it("a digit query still matches by phone", () => {
    expect(pickerCoincide(beto, "987654")).toBe(true);
    expect(pickerCoincide(ana, "987654")).toBe(false);
  });
});
