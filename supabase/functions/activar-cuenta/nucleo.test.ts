import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  decidir,
  esErrorEmailExistente,
  parseSolicitud,
  respuesta,
  verificarFirma,
} from "./nucleo";

/**
 * The pure decision core (issue #131). No Deno, no admin API, no network. An
 * INDEPENDENT HMAC oracle (node:crypto in the test runner) pins BOTH the digest
 * algorithm and the `codigo:email` message format the core signs — a round-trip
 * through the core alone couldn't catch a wrong separator.
 */
const CLAVE = "clave-de-prueba";
function firmar(codigo: string, email: string): string {
  return createHmac("sha256", CLAVE).update(`${codigo}:${email}`).digest("hex");
}

describe("parseSolicitud — normalize + validate the POST body", () => {
  it("uppercases the codigo and lower/trims the email", () => {
    expect(parseSolicitud({ codigo: "abc23456", email: "  Socio@Example.COM ", firma: "ff" })).toEqual({
      codigo: "ABC23456",
      email: "socio@example.com",
      firma: "ff",
    });
  });

  it("rejects a codigo outside the 8-char A-Z/2-9 alphabet", () => {
    expect(parseSolicitud({ codigo: "abc", email: "a@b.co", firma: "ff" })).toBeNull(); // too short
    expect(parseSolicitud({ codigo: "ABC23450", email: "a@b.co", firma: "ff" })).toBeNull(); // '0' not in 2-9
  });

  it("rejects a missing/non-string field, an empty email, or an empty firma", () => {
    expect(parseSolicitud({ codigo: "ABC23456", email: "a@b.co" })).toBeNull();
    expect(parseSolicitud({ codigo: "ABC23456", email: "   ", firma: "ff" })).toBeNull();
    expect(parseSolicitud({ codigo: "ABC23456", email: "a@b.co", firma: "" })).toBeNull();
    expect(parseSolicitud("nope")).toBeNull();
    expect(parseSolicitud(null)).toBeNull();
  });
});

describe("verificarFirma — HMAC-SHA256 over codigo:email", () => {
  it("accepts a firma minted over the normalized codigo:email", async () => {
    const firma = firmar("ABC23456", "socio@example.com");
    expect(await verificarFirma(CLAVE, "ABC23456", "socio@example.com", firma)).toBe(true);
  });

  it("rejects a tampered codigo, email, key, or a wrong firma", async () => {
    const firma = firmar("ABC23456", "socio@example.com");
    expect(await verificarFirma(CLAVE, "XYZ23456", "socio@example.com", firma)).toBe(false);
    expect(await verificarFirma(CLAVE, "ABC23456", "otro@example.com", firma)).toBe(false);
    expect(await verificarFirma("otra-clave", "ABC23456", "socio@example.com", firma)).toBe(false);
    expect(await verificarFirma(CLAVE, "ABC23456", "socio@example.com", "deadbeef")).toBe(false);
  });
});

describe("decidir — the activation gate", () => {
  const email = "socio@example.com";

  it("ok when firma valid, code found, unclaimed, email matches (case/space-insensitive)", () => {
    const d = decidir({ firmaOk: true, fila: { email: " Socio@Example.com ", auth_user_id: null }, email });
    expect(d).toEqual({ ok: true, email });
  });

  it("firma_invalida short-circuits before any row check", () => {
    expect(decidir({ firmaOk: false, fila: { email, auth_user_id: null }, email })).toEqual({
      ok: false,
      error: "firma_invalida",
    });
  });

  it("codigo_invalido when there is no roster row", () => {
    expect(decidir({ firmaOk: true, fila: null, email })).toEqual({ ok: false, error: "codigo_invalido" });
  });

  it("ya_reclamado when the row already has an auth user", () => {
    expect(decidir({ firmaOk: true, fila: { email, auth_user_id: "u1" }, email })).toEqual({
      ok: false,
      error: "ya_reclamado",
    });
  });

  it("sin_email when the row carries no email (null or blank)", () => {
    expect(decidir({ firmaOk: true, fila: { email: null, auth_user_id: null }, email })).toEqual({
      ok: false,
      error: "sin_email",
    });
    expect(decidir({ firmaOk: true, fila: { email: "  ", auth_user_id: null }, email })).toEqual({
      ok: false,
      error: "sin_email",
    });
  });

  it("email_no_coincide when the typed email differs from the row", () => {
    expect(decidir({ firmaOk: true, fila: { email: "otro@example.com", auth_user_id: null }, email })).toEqual({
      ok: false,
      error: "email_no_coincide",
    });
  });
});

describe("esErrorEmailExistente — existing-account pass-through", () => {
  it("true for the email_exists code (createUser on a second-gym member)", () => {
    expect(esErrorEmailExistente({ code: "email_exists" })).toBe(true);
  });

  it("true for the legacy already-registered message", () => {
    expect(
      esErrorEmailExistente({ message: "A user with this email address has already been registered" }),
    ).toBe(true);
  });

  it("false for an unrelated failure (must surface, not skip)", () => {
    expect(esErrorEmailExistente({ code: "over_email_send_rate_limit", message: "rate limit" })).toBe(false);
    expect(esErrorEmailExistente({ message: "" })).toBe(false);
  });
});

describe("respuesta — HTTP shaping", () => {
  it("200 { token_hash } on success", () => {
    expect(respuesta({ ok: true, tokenHash: "h123" })).toEqual({
      status: 200,
      body: JSON.stringify({ token_hash: "h123" }),
    });
  });

  it("maps each error code to its status + { error }", () => {
    expect(respuesta({ ok: false, error: "firma_invalida" })).toEqual({
      status: 401,
      body: JSON.stringify({ error: "firma_invalida" }),
    });
    expect(respuesta({ ok: false, error: "codigo_invalido" })).toEqual({
      status: 404,
      body: JSON.stringify({ error: "codigo_invalido" }),
    });
    expect(respuesta({ ok: false, error: "ya_reclamado" })).toEqual({
      status: 409,
      body: JSON.stringify({ error: "ya_reclamado" }),
    });
    expect(respuesta({ ok: false, error: "sin_email" })).toEqual({
      status: 409,
      body: JSON.stringify({ error: "sin_email" }),
    });
    expect(respuesta({ ok: false, error: "email_no_coincide" })).toEqual({
      status: 422,
      body: JSON.stringify({ error: "email_no_coincide" }),
    });
  });
});
