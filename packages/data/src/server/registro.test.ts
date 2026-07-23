import { describe, expect, it, vi } from "vitest";

import {
  firmaCodigo,
  invitacionInfo,
  parseCodigoInvitacion,
  reclamarCliente,
  reclamarPorCodigo,
  registrarSocio,
  registroSchema,
  telefonoAE164,
} from "./registro";
import type { SupabaseServer } from "./supabase";

// The pure surface of the registration DAL: the zod intake rule (mirrors the form
// + the DB constraints) and the MX-phone → E.164 normalization the RPC's create
// path relies on. The claim RPC's eight behaviors are proven in
// supabase/tests/registro_claim.sql (transaction-local, run via pnpm test:denial);
// the invite-code claim's DB contract lives in supabase/tests/reclamar_por_codigo.sql.

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

describe("parseCodigoInvitacion", () => {
  it("normalizes a valid code (trim + uppercase)", () => {
    expect(parseCodigoInvitacion("  abcd2345 ")).toBe("ABCD2345");
  });

  it("rejects a code of the wrong length", () => {
    expect(parseCodigoInvitacion("ABCD234")).toBeNull();
  });

  it("rejects a code with symbols outside A-Z/2-9 (0/1 excluded)", () => {
    expect(parseCodigoInvitacion("ABCD2301")).toBeNull();
  });

  it("rejects non-string input (absent query param)", () => {
    expect(parseCodigoInvitacion(null)).toBeNull();
    expect(parseCodigoInvitacion(undefined)).toBeNull();
  });
});

/** A fake client exposing exactly the `.rpc(name, args).single()/.maybeSingle()`
 *  chain the invite-code DAL walks — no supabase, no DB (ADR-0001 injectable seam). */
function fakeRpc(
  result: { data: unknown; error: unknown },
  capture?: (name: string, args: unknown) => void,
): SupabaseServer {
  return {
    rpc: (name: string, args: unknown) => {
      capture?.(name, args);
      return {
        single: async () => result,
        maybeSingle: async () => result,
      };
    },
  } as unknown as SupabaseServer;
}

describe("firmaCodigo — activation firma (audit 2026-07-22 §3)", () => {
  // The RPC's firma gate: only the server holds TENANT_ASSERTION_KEY, so only the server
  // can produce a valid firma over `activar:v1:${codigo}` — a direct PostgREST caller (H1)
  // or an attacker-appended `&codigo=` (H2) cannot. PINNED literal (HMAC-SHA256 of
  // "activar:v1:ABCD2345" with "test-key", derived outside this code).
  const FIRMA_PINNED = "087c644a7673332be892ce1f01bd35beb5fb6e52f8cccf0c7e890a827862dbc5";

  it("signs the domain-tagged code with the tenant key (pinned)", () => {
    vi.stubEnv("TENANT_ASSERTION_KEY", "test-key");
    expect(firmaCodigo("ABCD2345")).toBe(FIRMA_PINNED);
    vi.unstubAllEnvs();
  });

  it("throws when TENANT_ASSERTION_KEY is not configured", () => {
    vi.stubEnv("TENANT_ASSERTION_KEY", "");
    expect(() => firmaCodigo("ABCD2345")).toThrow("TENANT_ASSERTION_KEY");
    vi.unstubAllEnvs();
  });
});

describe("reclamarPorCodigo", () => {
  it("forwards the code + firma as p_codigo/p_firma and returns the gym slug row", async () => {
    let seen: { name: string; args: unknown } | null = null;
    const client = fakeRpc({ data: { gym_slug: "forge" }, error: null }, (name, args) => {
      seen = { name, args };
    });
    const result = await reclamarPorCodigo("ABCD2345", "firma-x", client);
    expect(result.gym_slug).toBe("forge");
    expect(seen).toEqual({
      name: "reclamar_por_codigo",
      args: { p_codigo: "ABCD2345", p_firma: "firma-x" },
    });
  });

  it("throws the RPC error message (bad firma / dead code / already-owned row)", async () => {
    const client = fakeRpc({ data: null, error: { message: "Código de invitación inválido o ya utilizado" } });
    await expect(reclamarPorCodigo("ZZZZZZZZ", "firma-x", client)).rejects.toThrow(
      "Código de invitación inválido o ya utilizado",
    );
  });
});

describe("reclamarCliente — tenant firma (spec 2026-07-13 §1.5, D2 binding)", () => {
  // The RPC's gym binding: only the server holds TENANT_ASSERTION_KEY, so only the
  // server can produce a valid p_firma for the host-resolved gym — a direct
  // PostgREST caller naming an arbitrary gym cannot. The expected value is a PINNED
  // literal (HMAC-SHA256 of "u-1:g-1" with "test-key", derived outside this code),
  // never recomputed the implementation's way.
  const FIRMA_PINNED = "106a15a15e7bcdb10b36ce36812ba202abec2fa8342f15000cd42cc749a15dfd";

  function fakeAuthRpc(capture: (name: string, args: unknown) => void): SupabaseServer {
    return {
      auth: { getClaims: async () => ({ data: { claims: { sub: "u-1" } } }) },
      rpc: (name: string, args: unknown) => {
        capture(name, args);
        return { single: async () => ({ data: { cliente_id: "c-1", reclamado: true }, error: null }) };
      },
    } as unknown as SupabaseServer;
  }

  it("sends p_gym_id plus the server-side firma over uid:gym", async () => {
    vi.stubEnv("TENANT_ASSERTION_KEY", "test-key");
    let seen: { name: string; args: unknown } | null = null;
    const client = fakeAuthRpc((name, args) => {
      seen = { name, args };
    });
    const result = await reclamarCliente("g-1", client);
    expect(result).toEqual({ cliente_id: "c-1", reclamado: true });
    expect(seen).toEqual({
      name: "reclamar_o_crear_cliente",
      args: { p_gym_id: "g-1", p_firma: FIRMA_PINNED },
    });
    vi.unstubAllEnvs();
  });

  it("throws when TENANT_ASSERTION_KEY is not configured (never calls the RPC unsigned)", async () => {
    vi.stubEnv("TENANT_ASSERTION_KEY", "");
    const client = fakeAuthRpc(() => {
      throw new Error("RPC must not be called without a firma");
    });
    await expect(reclamarCliente("g-1", client)).rejects.toThrow("TENANT_ASSERTION_KEY");
    vi.unstubAllEnvs();
  });
});

describe("invitacionInfo", () => {
  it("returns the {gym, cliente} projection for a valid code", async () => {
    const client = fakeRpc({
      data: { gym_nombre: "Forge", gym_slug: "forge", cliente_nombre: "Ana" },
      error: null,
    });
    const info = await invitacionInfo("ABCD2345", client);
    expect(info).toEqual({ gym_nombre: "Forge", gym_slug: "forge", cliente_nombre: "Ana" });
  });

  it("returns null for an unknown/dead code (no row, no error)", async () => {
    const client = fakeRpc({ data: null, error: null });
    expect(await invitacionInfo("ZZZZZZZZ", client)).toBeNull();
  });

  it("throws on a real RPC error", async () => {
    const client = fakeRpc({ data: null, error: { message: "boom" } });
    await expect(invitacionInfo("ABCD2345", client)).rejects.toThrow("boom");
  });
});

describe("registrarSocio invite threading", () => {
  const intake = {
    nombre: "Ana López",
    email: "ana@correo.mx",
    password: "unbuenpass",
    telefono: "614 111 2233",
    acepta: true,
  };

  /** Fake exposing `.auth.signUp()` (session drives the confirmation-off branch)
   *  plus the `.rpc().single()` chain the inline claim uses. */
  function fakeSignup(session: unknown, rpc: (name: string, args: unknown) => void): SupabaseServer {
    return {
      auth: { signUp: async () => ({ data: { session }, error: null }) },
      rpc: (name: string, args: unknown) => {
        rpc(name, args);
        return { single: async () => ({ data: { gym_slug: "forge" }, error: null }) };
      },
    } as unknown as SupabaseServer;
  }

  it("runs the invite claim (code + minted firma) when signUp returns a session (confirmation off)", async () => {
    // The inline claim mints firmaCodigo — the pinned digest of "activar:v1:ABCD2345" / "test-key".
    vi.stubEnv("TENANT_ASSERTION_KEY", "test-key");
    const rpc = vi.fn();
    const client = fakeSignup({ access_token: "x" }, rpc);
    const result = await registrarSocio(intake, { emailRedirectTo: "x", codigo: "ABCD2345" }, client);
    expect(result).toEqual({ ok: true, requiereConfirmacion: false });
    expect(rpc).toHaveBeenCalledWith("reclamar_por_codigo", {
      p_codigo: "ABCD2345",
      p_firma: "087c644a7673332be892ce1f01bd35beb5fb6e52f8cccf0c7e890a827862dbc5",
    });
    vi.unstubAllEnvs();
  });

  it("does NOT claim when confirmation is required (no session yet)", async () => {
    const rpc = vi.fn();
    const client = fakeSignup(null, rpc);
    const result = await registrarSocio(intake, { emailRedirectTo: "x", codigo: "ABCD2345" }, client);
    expect(result).toEqual({ ok: true, requiereConfirmacion: true });
    expect(rpc).not.toHaveBeenCalled();
  });
});
