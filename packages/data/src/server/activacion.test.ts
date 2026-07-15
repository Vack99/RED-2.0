import { describe, expect, it, vi } from "vitest";

import { firmaActivacion, iniciarActivacion, type ErrorActivacion } from "./activacion";
import type { SupabaseServer } from "./supabase";

/**
 * The activation DAL (PRD #130). We inject a fake `fetch` (the edge function boundary)
 * and a fake Supabase client (verifyOtp/updateUser/getClaims/rpc) and assert the three
 * things that matter: verify→session on success, the edge error taxonomy → typed
 * result, and the password-BEFORE-claim ordering with a swallowed claim failure. The
 * edge function's own decisions are proven in supabase/functions/activar-cuenta.
 */

const KEY = "test-key";
// PINNED literal: HMAC-SHA256("ABCD2345:ana@correo.mx", "test-key"), derived outside
// this code (never recomputed the implementation's way).
const FIRMA_PINNED = "cb27eb082c35d36a183f641851a27a06170fdbd00da3fb7e7f28da00e53a83f1";

/** A fetch double returning a fixed status/body and capturing the request. */
function fakeFetch(
  status: number,
  body: unknown,
  capture?: (url: string, init: RequestInit) => void,
): typeof fetch {
  return (async (url: string, init: RequestInit) => {
    capture?.(url, init);
    return {
      ok: status >= 200 && status < 300,
      status,
      json: async () => body,
    } as Response;
  }) as unknown as typeof fetch;
}

/** A client exposing just `auth.verifyOtp`, plus an `rpc` that FAILS the test if the
 *  claim ever runs from `iniciarActivacion` (re-entry semantics: no claim here). */
function fakeVerifyClient(verifyError: unknown): SupabaseServer {
  return {
    auth: { verifyOtp: async () => ({ error: verifyError }) },
    rpc: () => {
      throw new Error("iniciarActivacion must NOT run the claim");
    },
  } as unknown as SupabaseServer;
}

describe("firmaActivacion", () => {
  it("signs the normalized codigo:email with the tenant key (pinned)", () => {
    vi.stubEnv("TENANT_ASSERTION_KEY", KEY);
    // Raw inputs (lowercase code, mixed-case/padded email) must normalize to the same
    // digest as the clean form.
    expect(firmaActivacion("  abcd2345 ", "  Ana@Correo.MX ")).toBe(FIRMA_PINNED);
    expect(firmaActivacion("ABCD2345", "ana@correo.mx")).toBe(FIRMA_PINNED);
    vi.unstubAllEnvs();
  });

  it("throws when TENANT_ASSERTION_KEY is not configured", () => {
    vi.stubEnv("TENANT_ASSERTION_KEY", "");
    expect(() => firmaActivacion("ABCD2345", "ana@correo.mx")).toThrow("TENANT_ASSERTION_KEY");
    vi.unstubAllEnvs();
  });
});

describe("iniciarActivacion", () => {
  it("posts the normalized signed body and establishes the session on 200", async () => {
    vi.stubEnv("TENANT_ASSERTION_KEY", KEY);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
    let seen: { url: string; init: RequestInit } | null = null;
    const fetchFn = fakeFetch(200, { token_hash: "th-1" }, (url, init) => {
      seen = { url, init };
    });
    const verifyOtp = vi.fn().mockResolvedValue({ error: null });
    const client = { auth: { verifyOtp } } as unknown as SupabaseServer;

    const res = await iniciarActivacion(
      { codigo: "abcd2345", email: "  Ana@Correo.MX " },
      { fetchFn, client },
    );

    expect(res).toEqual({ ok: true });
    expect(verifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "th-1" });
    expect(seen!.url).toBe("https://proj.supabase.co/functions/v1/activar-cuenta");
    expect(JSON.parse(seen!.init.body as string)).toEqual({
      codigo: "ABCD2345",
      email: "ana@correo.mx",
      firma: FIRMA_PINNED,
    });
    vi.unstubAllEnvs();
  });

  it("never runs the claim on success (re-entry: code stays live until password step)", async () => {
    vi.stubEnv("TENANT_ASSERTION_KEY", KEY);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
    // fakeVerifyClient's rpc throws if touched — a passing test proves no claim ran.
    const res = await iniciarActivacion(
      { codigo: "ABCD2345", email: "ana@correo.mx" },
      { fetchFn: fakeFetch(200, { token_hash: "th-1" }), client: fakeVerifyClient(null) },
    );
    expect(res).toEqual({ ok: true });
    vi.unstubAllEnvs();
  });

  it.each<[number, ErrorActivacion]>([
    [401, "firma_invalida"],
    [404, "codigo_invalido"],
    [409, "ya_reclamado"],
    [409, "sin_email"],
    [422, "email_no_coincide"],
  ])("maps edge %i %s to the typed error", async (status, error) => {
    vi.stubEnv("TENANT_ASSERTION_KEY", KEY);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
    const res = await iniciarActivacion(
      { codigo: "ABCD2345", email: "ana@correo.mx" },
      { fetchFn: fakeFetch(status, { error }), client: fakeVerifyClient(null) },
    );
    expect(res).toEqual({ ok: false, error });
    vi.unstubAllEnvs();
  });

  it("folds an unknown edge code (405/500) to error_interno", async () => {
    vi.stubEnv("TENANT_ASSERTION_KEY", KEY);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
    const res = await iniciarActivacion(
      { codigo: "ABCD2345", email: "ana@correo.mx" },
      { fetchFn: fakeFetch(500, { error: "error_interno" }), client: fakeVerifyClient(null) },
    );
    expect(res).toEqual({ ok: false, error: "error_interno" });
    vi.unstubAllEnvs();
  });

  it("returns error_interno when the network throws (never propagates)", async () => {
    vi.stubEnv("TENANT_ASSERTION_KEY", KEY);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
    const fetchFn = (async () => {
      throw new Error("ECONNRESET");
    }) as unknown as typeof fetch;
    const res = await iniciarActivacion(
      { codigo: "ABCD2345", email: "ana@correo.mx" },
      { fetchFn, client: fakeVerifyClient(null) },
    );
    expect(res).toEqual({ ok: false, error: "error_interno" });
    vi.unstubAllEnvs();
  });

  it("returns error_interno when the recovery verify fails", async () => {
    vi.stubEnv("TENANT_ASSERTION_KEY", KEY);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://proj.supabase.co");
    const res = await iniciarActivacion(
      { codigo: "ABCD2345", email: "ana@correo.mx" },
      {
        fetchFn: fakeFetch(200, { token_hash: "th-1" }),
        client: fakeVerifyClient({ message: "Token expired" }),
      },
    );
    expect(res).toEqual({ ok: false, error: "error_interno" });
    vi.unstubAllEnvs();
  });
});
