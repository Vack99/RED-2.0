import { describe, expect, it, vi } from "vitest";

import {
  firmaCodigo,
  intentarReclamoConFirma,
  intentarReclamoPorCodigo,
  intentarReclamoPorEmail,
  invitacionInfo,
  parseCodigoInvitacion,
  registroSchema,
  telefonoAE164,
} from "./registro";
import type { SupabaseServer } from "./supabase";

// The pure surface of the registration DAL: the zod intake rule (mirrors the form
// + the DB constraints) and the MX-phone → E.164 normalization the RPC's create
// path relies on. The claim RPC's eight behaviors are proven in
// supabase/tests/registro_claim.sql (transaction-local, run via pnpm test:denial);
// the invite-code claim's DB contract lives in supabase/tests/reclamar_por_codigo.sql.
// What is proven HERE is the TS ceremony around those RPCs — the `intentar*` claim
// surface the five doors share (see the "el reclamo del socio" describes below).

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

// El reclamo del socio — the claim ceremony the five doors share. The RPCs are
// centralized in SQL; what lives here is the ceremony around them: which rail, what to
// pass, and the ONE verdict on a refusal (a value, never a throw — the caller is already
// authenticated, so a refused claim must never strand them). Each describe covers the
// doors that walk that rail.

describe("intentarReclamoPorCodigo — server-minted firma (/activar vincular, completarActivacion)", () => {
  // Same pinned digest the firmaCodigo describe above asserts: the ceremony must mint
  // exactly that, never a recomputed-the-implementation's-way value.
  const FIRMA_PINNED = "087c644a7673332be892ce1f01bd35beb5fb6e52f8cccf0c7e890a827862dbc5";

  it("mints the firma from the code and forwards codigo/firma/aviso to the RPC", async () => {
    vi.stubEnv("TENANT_ASSERTION_KEY", "test-key");
    let seen: { name: string; args: unknown } | null = null;
    const client = fakeRpc({ data: { gym_slug: "forge" }, error: null }, (name, args) => {
      seen = { name, args };
    });
    expect(await intentarReclamoPorCodigo("ABCD2345", "0.1-borrador", client)).toEqual({ ok: true });
    expect(seen).toEqual({
      name: "reclamar_por_codigo",
      args: { p_codigo: "ABCD2345", p_firma: FIRMA_PINNED, p_aviso_version: "0.1-borrador" },
    });
    vi.unstubAllEnvs();
  });

  it("refuses as a VALUE on a dead / already-used code (never strands the logged-in member)", async () => {
    vi.stubEnv("TENANT_ASSERTION_KEY", "test-key");
    const client = fakeRpc({
      data: null,
      error: { message: "Código de invitación inválido o ya utilizado" },
    });
    expect(await intentarReclamoPorCodigo("ZZZZZZZZ", null, client)).toEqual({
      ok: false,
      motivo: "Código de invitación inválido o ya utilizado",
    });
    vi.unstubAllEnvs();
  });

  it("refuses as a VALUE when the row is already owned in this gym (re-entry is not an error)", async () => {
    vi.stubEnv("TENANT_ASSERTION_KEY", "test-key");
    const client = fakeRpc({ data: null, error: { message: "Ya tienes cuenta en este gimnasio" } });
    expect(await intentarReclamoPorCodigo("ABCD2345", null, client)).toEqual({
      ok: false,
      motivo: "Ya tienes cuenta en este gimnasio",
    });
    vi.unstubAllEnvs();
  });

  it("refuses as a VALUE when TENANT_ASSERTION_KEY is absent, and never calls the RPC unsigned", async () => {
    vi.stubEnv("TENANT_ASSERTION_KEY", "");
    const client = fakeRpc({ data: null, error: null }, () => {
      throw new Error("RPC must not be called without a firma");
    });
    const res = await intentarReclamoPorCodigo("ABCD2345", null, client);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.motivo).toContain("TENANT_ASSERTION_KEY");
    vi.unstubAllEnvs();
  });

  it("forwards a null aviso version as undefined (no aviso rendered on this door)", async () => {
    vi.stubEnv("TENANT_ASSERTION_KEY", "test-key");
    let seen: { name: string; args: unknown } | null = null;
    const client = fakeRpc({ data: { gym_slug: "forge" }, error: null }, (name, args) => {
      seen = { name, args };
    });
    await intentarReclamoPorCodigo("ABCD2345", null, client);
    expect(seen).toEqual({
      name: "reclamar_por_codigo",
      args: { p_codigo: "ABCD2345", p_firma: FIRMA_PINNED, p_aviso_version: undefined },
    });
    vi.unstubAllEnvs();
  });
});

describe("intentarReclamoConFirma — firma forwarded from the URL (/auth/confirm magic-link rail)", () => {
  it("forwards the RECEIVED firma verbatim — never mints one (audit §3 H2)", async () => {
    // No TENANT_ASSERTION_KEY stubbed: this rail must not need one, because the firma
    // came in on the URL and only the RPC verifies it.
    let seen: { name: string; args: unknown } | null = null;
    const client = fakeRpc({ data: { gym_slug: "forge" }, error: null }, (name, args) => {
      seen = { name, args };
    });
    expect(await intentarReclamoConFirma("ABCD2345", "firma-x", "0.1-borrador", client)).toEqual({
      ok: true,
    });
    expect(seen).toEqual({
      name: "reclamar_por_codigo",
      args: { p_codigo: "ABCD2345", p_firma: "firma-x", p_aviso_version: "0.1-borrador" },
    });
  });

  it("sends an EMPTY firma through for the RPC to reject (an appended &codigo= with no firma)", async () => {
    let seen: { name: string; args: unknown } | null = null;
    const client = fakeRpc(
      { data: null, error: { message: "Firma de activación inválida" } },
      (name, args) => {
        seen = { name, args };
      },
    );
    expect(await intentarReclamoConFirma("ABCD2345", "", null, client)).toEqual({
      ok: false,
      motivo: "Firma de activación inválida",
    });
    expect(seen).toEqual({
      name: "reclamar_por_codigo",
      args: { p_codigo: "ABCD2345", p_firma: "", p_aviso_version: undefined },
    });
  });
});

describe("intentarReclamoPorEmail — verified-email rail (/auth/confirm plain signup, /reservar retry)", () => {
  const FIRMA_PINNED = "106a15a15e7bcdb10b36ce36812ba202abec2fa8342f15000cd42cc749a15dfd";

  function fakeClaimRpc(
    result: { data: unknown; error: unknown },
    capture?: (name: string, args: unknown) => void,
    sub: string | null = "u-1",
  ): SupabaseServer {
    return {
      auth: { getClaims: async () => ({ data: { claims: sub ? { sub } : {} } }) },
      rpc: (name: string, args: unknown) => {
        capture?.(name, args);
        return { single: async () => result };
      },
    } as unknown as SupabaseServer;
  }

  it("claims in the door's already-resolved gym and reports ok", async () => {
    vi.stubEnv("TENANT_ASSERTION_KEY", "test-key");
    let seen: { name: string; args: unknown } | null = null;
    const client = fakeClaimRpc(
      { data: { cliente_id: "c-1", reclamado: true }, error: null },
      (name, args) => {
        seen = { name, args };
      },
    );
    expect(await intentarReclamoPorEmail("g-1", "0.1-borrador", client)).toEqual({ ok: true });
    expect(seen).toEqual({
      name: "reclamar_o_crear_cliente",
      args: { p_gym_id: "g-1", p_firma: FIRMA_PINNED, p_aviso_version: "0.1-borrador" },
    });
    vi.unstubAllEnvs();
  });

  it("reports ok on an idempotent re-run (row already owned → reclamado:false, membership re-upserted)", async () => {
    vi.stubEnv("TENANT_ASSERTION_KEY", "test-key");
    const client = fakeClaimRpc({ data: { cliente_id: "c-1", reclamado: false }, error: null });
    expect(await intentarReclamoPorEmail("g-1", null, client)).toEqual({ ok: true });
    vi.unstubAllEnvs();
  });

  it("refuses as a VALUE when the RPC raises (unverified email / missing phone on the create path)", async () => {
    vi.stubEnv("TENANT_ASSERTION_KEY", "test-key");
    const client = fakeClaimRpc({ data: null, error: { message: "Teléfono requerido" } });
    expect(await intentarReclamoPorEmail("g-1", null, client)).toEqual({
      ok: false,
      motivo: "Teléfono requerido",
    });
    vi.unstubAllEnvs();
  });

  it("refuses as a VALUE with no live session — the /reservar cold-retry path", async () => {
    vi.stubEnv("TENANT_ASSERTION_KEY", "test-key");
    const client = fakeClaimRpc(
      { data: null, error: null },
      () => {
        throw new Error("RPC must not be called without a session");
      },
      null,
    );
    expect(await intentarReclamoPorEmail("g-1", null, client)).toEqual({
      ok: false,
      motivo: "No autenticado",
    });
    vi.unstubAllEnvs();
  });

  it("refuses as a VALUE when TENANT_ASSERTION_KEY is absent, and never calls the RPC unsigned", async () => {
    vi.stubEnv("TENANT_ASSERTION_KEY", "");
    const client = fakeClaimRpc({ data: null, error: null }, () => {
      throw new Error("RPC must not be called without a firma");
    });
    const res = await intentarReclamoPorEmail("g-1", null, client);
    expect(res.ok).toBe(false);
    expect(res.ok === false && res.motivo).toContain("TENANT_ASSERTION_KEY");
    vi.unstubAllEnvs();
  });

  it("forwards a null aviso version as undefined (no aviso rendered on this door)", async () => {
    vi.stubEnv("TENANT_ASSERTION_KEY", "test-key");
    let seen: { name: string; args: unknown } | null = null;
    const client = fakeClaimRpc(
      { data: { cliente_id: "c-1", reclamado: true }, error: null },
      (name, args) => {
        seen = { name, args };
      },
    );
    await intentarReclamoPorEmail("g-1", null, client);
    expect(seen).toEqual({
      name: "reclamar_o_crear_cliente",
      args: { p_gym_id: "g-1", p_firma: FIRMA_PINNED, p_aviso_version: undefined },
    });
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
