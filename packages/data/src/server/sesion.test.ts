import { describe, expect, it, vi } from "vitest";

import {
  actualizarPassword,
  confirmarCodigoDeCorreo,
  confirmarTokenHash,
  enviarMagicLink,
  iniciarSesion,
  reenviarConfirmacion,
} from "./sesion";
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

  // `noConfirmado` is not decoration: it is the ONLY thing that tells the form to render
  // the resend control, and the copy no longer points at a link that may already have been
  // rotated away by the member's own retries (incident 2026-08-30).
  it("keeps the unconfirmed-email path distinct from a wrong credential, and flags it", async () => {
    const { client } = conError({ code: "email_not_confirmed", status: 400 });

    const res = await iniciarSesion("ana@correo.mx", "secreta123", client);

    expect(res).toEqual({
      ok: false,
      error: "Confirma tu correo antes de entrar. Si no llegó, reenvíalo aquí abajo.",
      noConfirmado: true,
    });
  });

  it("never flags a wrong credential as unconfirmed (no resend control on that arm)", async () => {
    const { client } = conError({ code: "invalid_credentials", status: 400 });

    const res = await iniciarSesion("ana@correo.mx", "secreta123", client);

    expect(res).not.toHaveProperty("noConfirmado");
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

  it("never retries a padded input when the FIRST error was not a credential rejection", async () => {
    // A 500 means the server never weighed the password: a second attempt proves nothing and
    // spends another slot against the rate limit.
    const { signInWithPassword, client } = conError({ code: "unexpected_failure", status: 500 });

    const res = await iniciarSesion("ana@correo.mx", "secreta123 ", client);

    expect(res).toEqual({ ok: false, error: "Correo o contraseña incorrectos." });
    expect(signInWithPassword).toHaveBeenCalledTimes(1);
  });

  it("maps a rate limit hit BY THE RETRY to the throttle copy, not to 'wrong password'", async () => {
    const signInWithPassword = vi
      .fn()
      .mockResolvedValueOnce({ error: { code: "invalid_credentials", status: 400 } })
      .mockResolvedValueOnce({ error: { code: "over_request_rate_limit", status: 429 } });
    const client = { auth: { signInWithPassword } } as unknown as SupabaseServer;

    const res = await iniciarSesion("ana@correo.mx", "secreta123 ", client);

    expect(res).toEqual({
      ok: false,
      error: "Demasiados intentos. Espera unos minutos e inténtalo de nuevo.",
    });
    expect(signInWithPassword).toHaveBeenCalledTimes(2);
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

  // The route logs `code`/`status`, and a message alone cannot tell "expired" from
  // "already used" — which is exactly the distinction the 08-30 wedge needed and lacked.
  it("carries GoTrue's code + status through so /auth/confirm can log WHY", async () => {
    const verifyOtp = vi
      .fn()
      .mockResolvedValue({ error: { message: "Token has expired", code: "otp_expired", status: 403 } });
    const client = { auth: { verifyOtp } } as unknown as SupabaseServer;

    const res = await confirmarTokenHash("email", "hash-3", client);

    expect(res).toEqual({ ok: false, error: "Token has expired", code: "otp_expired", status: 403 });
  });
});

/**
 * The OTP fallback rail (fable verdict #1): the 6-digit code the confirmation mail prints
 * beside the link, redeemed by hand when the link itself dies in transit.
 */
describe("confirmarCodigoDeCorreo — verifyOtp args + error mapping", () => {
  it("forwards the trimmed email + token as an 'email' OTP", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ error: null });
    const client = { auth: { verifyOtp } } as unknown as SupabaseServer;

    const res = await confirmarCodigoDeCorreo("  ana@correo.mx ", "123456", client);

    expect(res).toEqual({ ok: true });
    expect(verifyOtp).toHaveBeenCalledWith({
      email: "ana@correo.mx",
      token: "123456",
      type: "email",
    });
  });

  it("maps a rejected code to { ok:false, error } (the action collapses it to one message)", async () => {
    const verifyOtp = vi.fn().mockResolvedValue({ error: { message: "Token has expired" } });
    const client = { auth: { verifyOtp } } as unknown as SupabaseServer;

    const res = await confirmarCodigoDeCorreo("ana@correo.mx", "000000", client);

    expect(res).toEqual({ ok: false, error: "Token has expired" });
  });
});

/**
 * `reenviarConfirmacion` is the door FC-01 proved did not exist: `grep "\.resend("` over
 * the whole repo returned zero hits, so the only fresh confirmation link came from
 * re-POSTing /registro — which rotates the previous one away. It reports honestly; the
 * "enviado"-regardless posture is the ACTION's, not the DAL's.
 */
describe("reenviarConfirmacion — resend args + honest result", () => {
  it("forwards { type:'signup', trimmed email, emailRedirectTo } and resolves ok", async () => {
    const resend = vi.fn().mockResolvedValue({ error: null });
    const client = { auth: { resend } } as unknown as SupabaseServer;

    const res = await reenviarConfirmacion(
      "  ana@correo.mx ",
      "https://red.example/auth/confirm",
      client,
    );

    expect(res).toEqual({ ok: true });
    expect(resend).toHaveBeenCalledWith({
      type: "signup",
      email: "ana@correo.mx",
      options: { emailRedirectTo: "https://red.example/auth/confirm" },
    });
  });

  it("reports the failure and logs it WITHOUT the address (the log would re-open the enumeration channel)", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const resend = vi
      .fn()
      .mockResolvedValue({ error: { message: "email rate limit exceeded", code: "over_email_send_rate_limit", status: 429 } });
    const client = { auth: { resend } } as unknown as SupabaseServer;

    const res = await reenviarConfirmacion("ana@correo.mx", "https://red.example/auth/confirm", client);

    expect(res).toEqual({ ok: false, error: "email rate limit exceeded" });
    expect(warn).toHaveBeenCalledTimes(1);
    const linea = String(warn.mock.calls[0]?.[0]);
    expect(JSON.parse(linea)).toMatchObject({
      event: "reenvio-confirmacion-error",
      code: "over_email_send_rate_limit",
      status: 429,
    });
    expect(linea).not.toContain("ana@correo.mx");
    warn.mockRestore();
  });
});

/**
 * `enviarMagicLink` is the activation `cuenta_existente` rail (audit §4): a passwordless
 * sign-in to an EXISTING account only. We inject a fake `auth.signInWithOtp` and assert the
 * exact args it forwards (shouldCreateUser:false is load-bearing — never provision here)
 * and that a failed send is now REPORTED: it used to discard the result and promise "Revisa
 * tu correo" for mail that never left (FC-16), and nothing leaks by saying so — the caller
 * only reaches this rail once the activation edge function answered `cuenta_existente`.
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

  it("reports a failed send instead of promising 'Revisa tu correo', and logs code/status", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const signInWithOtp = vi
      .fn()
      .mockResolvedValue({ error: { message: "rate limited", code: "over_email_send_rate_limit", status: 429 } });
    const client = { auth: { signInWithOtp } } as unknown as SupabaseServer;

    const res = await enviarMagicLink(
      "ana@correo.mx",
      "https://red.example/auth/confirm?codigo=ABCD2345&firma=ff&next=/reservar",
      client,
    );

    expect(res).toEqual({ ok: false, error: "rate limited" });
    expect(warn).toHaveBeenCalledTimes(1);
    const linea = String(warn.mock.calls[0]?.[0]);
    expect(JSON.parse(linea)).toMatchObject({
      event: "magic-link-send-error",
      code: "over_email_send_rate_limit",
      status: 429,
    });
    // The redirect carries the invite code AND its firma — neither belongs in a log line.
    expect(linea).not.toContain("ABCD2345");
    expect(linea).not.toContain("ana@correo.mx");
    warn.mockRestore();
  });
});
