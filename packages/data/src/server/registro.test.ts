import { describe, expect, it } from "vitest";

import { registroSchema, telefonoAE164 } from "./registro";

// The pure surface of the registration DAL: the zod intake rule (mirrors the form
// + the DB constraints) and the MX-phone → E.164 normalization the RPC's create
// path relies on. The claim RPC's eight behaviors are proven in
// supabase/tests/registro_claim.sql (transaction-local, run via pnpm test:denial).

describe("registroSchema", () => {
  const valido = {
    nombre: "Ana López",
    email: "ana@correo.mx",
    password: "unbuenpass",
    telefono: "614 111 2233",
    acepta: true,
  };

  it("accepts a complete, valid registration", () => {
    expect(registroSchema.safeParse(valido).success).toBe(true);
  });

  it("rejects a too-short nombre", () => {
    expect(registroSchema.safeParse({ ...valido, nombre: "Al" }).success).toBe(false);
  });

  it("rejects an invalid email", () => {
    expect(registroSchema.safeParse({ ...valido, email: "no-arroba" }).success).toBe(false);
  });

  it("rejects a password under 8 chars", () => {
    expect(registroSchema.safeParse({ ...valido, password: "corto" }).success).toBe(false);
  });

  it("rejects a phone without 10 digits", () => {
    expect(registroSchema.safeParse({ ...valido, telefono: "614 111" }).success).toBe(false);
  });

  it("rejects an unchecked terms/privacy box", () => {
    expect(registroSchema.safeParse({ ...valido, acepta: false }).success).toBe(false);
  });
});

describe("telefonoAE164", () => {
  it("normalizes a formatted MX 10-digit number to E.164", () => {
    expect(telefonoAE164("614 111 2233")).toBe("+526141112233");
  });

  it("strips every non-digit before prefixing +52", () => {
    expect(telefonoAE164("(614) 111-2233")).toBe("+526141112233");
  });
});
