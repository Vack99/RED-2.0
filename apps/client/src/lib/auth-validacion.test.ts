import { describe, expect, it } from "vitest";

import {
  validarCorreo,
  validarPasswordNueva,
  validarPasswordRequerida,
} from "./auth-validacion";

// The forms show inline, designed field errors (not raw HTML5 bubbles). These
// pure validators are that logic — asserted by external behavior (message or
// null), never by how the form renders them.

describe("validarCorreo", () => {
  it("flags an empty correo", () => {
    expect(validarCorreo("")).toBe("Escribe tu correo.");
    expect(validarCorreo("   ")).toBe("Escribe tu correo.");
  });

  it("flags a malformed correo", () => {
    for (const bad of ["abc", "abc@", "abc@def", "a b@c.co", "@c.co"]) {
      expect(validarCorreo(bad), bad).toBe("Correo no válido. Revisa el formato.");
    }
  });

  it("accepts a well-formed correo (trimming surrounding space)", () => {
    expect(validarCorreo("socio@red-demo.test")).toBeNull();
    expect(validarCorreo("  socio@red-demo.test  ")).toBeNull();
  });
});

describe("validarPasswordRequerida", () => {
  it("flags an empty contraseña but accepts any non-empty one (login never reveals length rules)", () => {
    expect(validarPasswordRequerida("")).toBe("Escribe tu contraseña.");
    expect(validarPasswordRequerida("x")).toBeNull();
  });
});

describe("validarPasswordNueva", () => {
  it("requires at least 8 characters", () => {
    expect(validarPasswordNueva("")).toBe("Mínimo 8 caracteres.");
    expect(validarPasswordNueva("1234567")).toBe("Mínimo 8 caracteres.");
    expect(validarPasswordNueva("12345678")).toBeNull();
  });
});
