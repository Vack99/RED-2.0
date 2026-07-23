import { describe, expect, it, vi } from "vitest";

import { confirmarTokenHash, enviarMagicLink } from "./sesion";
import type { SupabaseServer } from "./supabase";

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
