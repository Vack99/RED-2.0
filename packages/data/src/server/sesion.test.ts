import { describe, expect, it, vi } from "vitest";

import { actualizarPassword, confirmarTokenHash, enviarMagicLink, iniciarSesion } from "./sesion";
import type { SupabaseServer } from "./supabase";

/**
 * `iniciarSesion` is the login verify site. Two things are asserted here that prod proved
 * are not free: the ERROR MAP (a throttled attempt must not read as "wrong password" —
 * that copy sends a member to reset a password that works), and the TRIM PARITY with every
 * set site (`registroSchema`, `actualizarPassword`), since a set/verify pair that disagrees
 * about a trailing space rejects a correct password with no visible cause.
 */
describe("iniciarSesion — error map + trim parity", () => {
  const conError = (error: unknown) => {
    const signInWithPassword = vi.fn().mockResolvedValue({ error });
    return {
      signInWithPassword,
      client: { auth: { signInWithPassword } } as unknown as SupabaseServer,
    };
  };

  it("trims BOTH email and password before signInWithPassword", async () => {
    const { signInWithPassword, client } = conError(null);

    const res = await iniciarSesion("  ana@correo.mx ", " secreta123 ", client);

    expect(res).toEqual({ ok: true });
    expect(signInWithPassword).toHaveBeenCalledWith({
      email: "ana@correo.mx",
      password: "secreta123",
    });
  });

  it("surfaces a rate limit distinctly (over_request_rate_limit)", async () => {
    const { client } = conError({ code: "over_request_rate_limit", status: 429 });

    const res = await iniciarSesion("ana@correo.mx", "secreta123", client);

    expect(res).toEqual({
      ok: false,
      error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
    });
  });

  it("surfaces any 429-class error distinctly, even with an unfamiliar code", async () => {
    const { client } = conError({ code: "otro_limite", status: 429 });

    const res = await iniciarSesion("ana@correo.mx", "secreta123", client);

    expect(res).toEqual({
      ok: false,
      error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
    });
  });

  it("keeps the unconfirmed-email path distinct from a wrong credential", async () => {
    const { client } = conError({ code: "email_not_confirmed", status: 400 });

    const res = await iniciarSesion("ana@correo.mx", "secreta123", client);

    expect(res).toEqual({
      ok: false,
      error: "Confirma tu correo antes de entrar. Revisa el enlace que te enviamos.",
    });
  });

  it("still collapses a genuine credential failure to one opaque message", async () => {
    const { client } = conError({ code: "invalid_credentials", status: 400 });

    const res = await iniciarSesion("ana@correo.mx", "secreta123", client);

    expect(res).toEqual({ ok: false, error: "Correo o contraseña incorrectos." });
  });

  it("retries ONCE with the raw password when the trimmed attempt fails a padded input", async () => {
    // The legacy cohort: the stored hash predates trim parity and holds the trailing space.
    const signInWithPassword = vi
      .fn()
      .mockResolvedValueOnce({ error: { code: "invalid_credentials", status: 400 } })
      .mockResolvedValueOnce({ error: null });
    const client = { auth: { signInWithPassword } } as unknown as SupabaseServer;

    const res = await iniciarSesion("ana@correo.mx", "secreta123 ", client);

    expect(res).toEqual({ ok: true });
    expect(signInWithPassword).toHaveBeenCalledTimes(2);
    expect(signInWithPassword).toHaveBeenNthCalledWith(1, {
      email: "ana@correo.mx",
      password: "secreta123",
    });
    expect(signInWithPassword).toHaveBeenNthCalledWith(2, {
      email: "ana@correo.mx",
      password: "secreta123 ",
    });
  });

  it("never retries when trimming changed nothing (one attempt, one failure)", async () => {
    const { signInWithPassword, client } = conError({ code: "invalid_credentials", status: 400 });

    const res = await iniciarSesion("ana@correo.mx", "secreta123", client);

    expect(res).toEqual({ ok: false, error: "Correo o contraseña incorrectos." });
    expect(signInWithPassword).toHaveBeenCalledTimes(1);
  });
});

/** The set half of that parity: what `actualizarPassword` STORES must be what
 *  `iniciarSesion` verifies, or /restablecer and /activar hand out passwords the login
 *  form can never reproduce. */
describe("actualizarPassword — trim parity with the login verify site", () => {
  it("trims the password before updateUser", async () => {
    const updateUser = vi.fn().mockResolvedValue({ error: null });
    const client = { auth: { updateUser } } as unknown as SupabaseServer;

    const res = await actualizarPassword(" secreta123 ", client);

    expect(res).toEqual({ ok: true });
    expect(updateUser).toHaveBeenCalledWith({ password: "secreta123" });
  });
});

/**
 * `confirmarTokenHash` is the token-hash sibling of `confirmarCodigo` for the Send
 * Email Hook link (#75). We inject a fake `auth.verifyOtp` and assert the two things
 * that matter: the exact args it forwards, and that a verifyOtp error maps to the
 * discriminated `{ ok:false, error }` (never a throw).
 */
describe("confirmarTokenHash — verifyOtp args + error mapping", () => {
  it("forwards { type, token_hash } to verifyOtp and returns ok on success", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ error: null });
    const client = { auth: { verifyOtp } } as unknown as SupabaseServer;

    const res = await confirmarTokenHash("recovery", "hash-1", client);

    expect(res).toEqual({ ok: true });
    expect(verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "hash-1" });
  });

  it("maps a verifyOtp error to { ok:false, error }", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ error: { message: "Token has expired" } });
    const client = { auth: { verifyOtp } } as unknown as SupabaseServer;

    const res = await confirmarTokenHash("email", "hash-2", client);

    expect(res).toEqual({ ok: false, error: "Token has expired" });
  });
});

/**
 * `enviarMagicLink` is the activation `cuenta_existente` rail (audit §4): a passwordless
 * sign-in to an EXISTING account only. We inject a fake `auth.signInWithOtp` and assert the
 * exact args it forwards (shouldCreateUser:false is load-bearing — never provision here) and
 * that it always resolves ok (never leaks whether an address is registered).
 */
describe("enviarMagicLink — signInWithOtp args", () => {
  it("forwards the trimmed email + shouldCreateUser:false + emailRedirectTo, resolves ok", async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: null });
    const client = { auth: { signInWithOtp } } as unknown as SupabaseServer;

    const res = await enviarMagicLink("  ana@correo.mx ", "https://red.example/auth/confirm?codigo=ABCD2345&firma=ff&next=/reservar", client);

    expect(res).toEqual({ ok: true });
    expect(signInWithOtp).toHaveBeenCalledWith({
      email: "ana@correo.mx",
      options: {
        shouldCreateUser: false,
        emailRedirectTo: "https://red.example/auth/confirm?codigo=ABCD2345&firma=ff&next=/reservar",
      },
    });
  });

  it("resolves ok even when signInWithOtp errors (never leaks registration state)", async () => {
    const signInWithOtp = vi.fn().mockResolvedValue({ error: { message: "rate limited" } });
    const client = { auth: { signInWithOtp } } as unknown as SupabaseServer;

    const res = await enviarMagicLink("ana@correo.mx", "https://red.example/auth/confirm", client);

    expect(res).toEqual({ ok: true });
  });
});
