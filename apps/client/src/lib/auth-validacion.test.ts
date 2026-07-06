import { describe, expect, it } from "vitest";

import {
  validarCorreo,
  validarNombreCompleto,
  validarPasswordNueva,
  validarPasswordRequerida,
  validarTelefono,
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

describe("validarNombreCompleto", () => {
  it("flags an empty or too-short nombre (mirrors the DB min-3 rule)", () => {
    expect(validarNombreCompleto("")).toBe("Escribe tu nombre completo.");
    expect(validarNombreCompleto("  ")).toBe("Escribe tu nombre completo.");
    expect(validarNombreCompleto("Al")).toBe("Escribe tu nombre completo.");
  });

  it("accepts a full name (trimming surrounding space)", () => {
    expect(validarNombreCompleto("Ana López")).toBeNull();
    expect(validarNombreCompleto("  Aarón Talavera  ")).toBeNull();
  });
});

describe("validarTelefono", () => {
  it("flags anything that is not a 10-digit MX number", () => {
    expect(validarTelefono("")).toBe("Ingresa un teléfono a 10 dígitos.");
    expect(validarTelefono("614 111")).toBe("Ingresa un teléfono a 10 dígitos.");
    expect(validarTelefono("614 111 22334")).toBe("Ingresa un teléfono a 10 dígitos.");
  });

  it("accepts a 10-digit number regardless of separators", () => {
    expect(validarTelefono("614 111 2233")).toBeNull();
    expect(validarTelefono("(614) 111-2233")).toBeNull();
  });
});
