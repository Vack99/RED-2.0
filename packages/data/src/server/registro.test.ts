import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  firmaCodigo,
  intentarReclamoConFirma,
  intentarReclamoPorCodigo,
  intentarReclamoPorEmail,
  invitacionInfo,
  parseCodigoInvitacion,
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

// The signUp door itself. GoTrue answers three structurally different situations with a
// 200, and this door used to render all three as one identical "Revisa tu correo"
// (incident 2026-08-30: FC-02 the retry that kills the live link, FC-18 the mail that is
// never sent, FC-19 English in a Spanish form). What is proven here is that each outcome
// is now told apart, that a resubmit inside the window spends no mail from the
// project-wide auth bucket, and that no GoTrue string reaches the member verbatim.
describe("registrarSocio", () => {
  const MINUTO = 60 * 1000;
  const DIA = 24 * 60 * MINUTO;
  const OPTS = { emailRedirectTo: "https://gym.test/auth/confirm" };

  let n = 0;
  /** A fresh address per test: the send throttle is module-level state that outlives one
   *  `it`, so a reused address would make the tests throttle each other. */
  const correo = () => `socio${++n}@correo.mx`;

  const alta = (email: string) => ({
    nombre: "Ana López",
    email,
    password: "unbuenpass",
    telefono: "614 111 2233",
    acepta: true,
  });

  /** A GoTrue user row `edadMs` old. `identities: []` is the sanitized answer GoTrue
   *  returns for an ALREADY-CONFIRMED address (and it mails nothing). */
  const usuario = (edadMs = 0, identities: unknown = [{ id: "i-1" }]) => ({
    id: "u-1",
    created_at: new Date(Date.now() - edadMs).toISOString(),
    identities,
  });
  const usuarioNuevo = () => ({ data: { user: usuario(), session: null }, error: null });
  const NUEVO = { ok: true, estado: "nuevo", requiereConfirmacion: true };

  /** The fake answers at CALL time — several tests advance fake timers between calls and
   *  `created_at` has to move with the clock. */
  function fakeSignUp(
    respuesta: (args: unknown) => { data: unknown; error: unknown },
  ): SupabaseServer {
    return {
      auth: { signUp: async (args: unknown) => respuesta(args) },
    } as unknown as SupabaseServer;
  }

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("refuses a bad intake before touching GoTrue", async () => {
    const client = fakeSignUp(() => {
      throw new Error("signUp must not run on invalid intake");
    });
    expect(await registrarSocio({ ...alta(correo()), telefono: "614" }, OPTS, client)).toEqual({
      ok: false,
      error: "Teléfono inválido (10 dígitos)",
    });
  });

  it("reports `nuevo` for a first-time address, with the name + E.164 phone GoTrue stores", async () => {
    const email = correo();
    let visto: unknown = null;
    const client = fakeSignUp((args) => {
      visto = args;
      return usuarioNuevo();
    });
    expect(await registrarSocio(alta(email), OPTS, client)).toEqual(NUEVO);
    expect(visto).toEqual({
      email,
      password: "unbuenpass",
      options: {
        emailRedirectTo: OPTS.emailRedirectTo,
        data: { full_name: "Ana López", phone_e164: "+526141112233" },
      },
    });
  });

  it("reports `requiereConfirmacion:false` when a session comes back (confirmations off)", async () => {
    const client = fakeSignUp(() => ({
      data: { user: usuario(), session: { access_token: "t" } },
      error: null,
    }));
    expect(await registrarSocio(alta(correo()), OPTS, client)).toEqual({
      ok: true,
      estado: "nuevo",
      requiereConfirmacion: false,
    });
  });

  it("reports `cuentaExistente` for the identity-less answer, and spends no throttle (FC-18)", async () => {
    // GoTrue mails NOTHING here, so the address must stay free to try again — throttling
    // it would charge the member for a send that never happened.
    const email = correo();
    let llamadas = 0;
    const client = fakeSignUp(() => {
      llamadas += 1;
      return { data: { user: usuario(0, []), session: null }, error: null };
    });
    expect(await registrarSocio(alta(email), OPTS, client)).toEqual({
      ok: true,
      estado: "cuentaExistente",
    });
    expect(await registrarSocio(alta(email), OPTS, client)).toEqual({
      ok: true,
      estado: "cuentaExistente",
    });
    expect(llamadas).toBe(2);
  });

  it("reports `yaEnviado` when GoTrue returns a pre-existing unconfirmed row (FC-02)", async () => {
    // The row predates this request, so the mail just sent REPLACED the pending link:
    // the screen has to say "open the newest one", not "check your mail".
    const client = fakeSignUp(() => ({
      data: { user: usuario(30 * MINUTO), session: null },
      error: null,
    }));
    expect(await registrarSocio(alta(correo()), OPTS, client)).toEqual({
      ok: true,
      estado: "yaEnviado",
    });
  });

  it("treats a response with no identities array as a send, never as an existing account", async () => {
    const client = fakeSignUp(() => ({
      data: { user: usuario(0, undefined), session: null },
      error: null,
    }));
    expect(await registrarSocio(alta(correo()), OPTS, client)).toEqual(NUEVO);
  });

  it("reports `nuevo` when GoTrue returns no user row at all", async () => {
    const client = fakeSignUp(() => ({ data: { user: null, session: null }, error: null }));
    expect(await registrarSocio(alta(correo()), OPTS, client)).toEqual(NUEVO);
  });

  it("answers a resubmit inside the window from memory, spending no second mail", async () => {
    const email = correo();
    let llamadas = 0;
    const client = fakeSignUp(() => {
      llamadas += 1;
      return usuarioNuevo();
    });
    expect(await registrarSocio(alta(email), OPTS, client)).toEqual(NUEVO);
    expect(await registrarSocio(alta(email), OPTS, client)).toEqual({
      ok: true,
      estado: "yaEnviado",
    });
    expect(llamadas).toBe(1);
  });

  it("throttles the address case-insensitively", async () => {
    const email = correo();
    let llamadas = 0;
    const client = fakeSignUp(() => {
      llamadas += 1;
      return usuarioNuevo();
    });
    await registrarSocio(alta(email), OPTS, client);
    expect(await registrarSocio(alta(email.toUpperCase()), OPTS, client)).toEqual({
      ok: true,
      estado: "yaEnviado",
    });
    expect(llamadas).toBe(1);
  });

  it("lets the address through again once the 5-minute window passes", async () => {
    vi.useFakeTimers();
    const email = correo();
    let llamadas = 0;
    const client = fakeSignUp(() => {
      llamadas += 1;
      return usuarioNuevo();
    });
    await registrarSocio(alta(email), OPTS, client);
    vi.advanceTimersByTime(4 * MINUTO);
    expect(await registrarSocio(alta(email), OPTS, client)).toEqual({
      ok: true,
      estado: "yaEnviado",
    });
    vi.advanceTimersByTime(2 * MINUTO);
    expect(await registrarSocio(alta(email), OPTS, client)).toEqual(NUEVO);
    expect(llamadas).toBe(2);
  });

  it("caps one address at 10 mails a day — one member cannot starve the shared bucket (FC-09)", async () => {
    vi.useFakeTimers();
    const email = correo();
    let llamadas = 0;
    const client = fakeSignUp(() => {
      llamadas += 1;
      return usuarioNuevo();
    });
    for (let i = 0; i < 10; i += 1) {
      expect(await registrarSocio(alta(email), OPTS, client)).toEqual(NUEVO);
      vi.advanceTimersByTime(5 * MINUTO + 1000);
    }
    expect(await registrarSocio(alta(email), OPTS, client)).toEqual({
      ok: true,
      estado: "yaEnviado",
    });
    expect(llamadas).toBe(10);
  });

  it("forgets an address once its day rolls over (the throttle map stays bounded)", async () => {
    vi.useFakeTimers();
    const viejo = correo();
    let llamadas = 0;
    const client = fakeSignUp(() => {
      llamadas += 1;
      return usuarioNuevo();
    });
    await registrarSocio(alta(viejo), OPTS, client);
    vi.advanceTimersByTime(DIA + MINUTO);
    // A send for ANOTHER address is what sweeps the stale entry out of the map…
    await registrarSocio(alta(correo()), OPTS, client);
    // …and the rolled-over address starts over with a full daily allowance.
    expect(await registrarSocio(alta(viejo), OPTS, client)).toEqual(NUEVO);
    expect(llamadas).toBe(3);
  });

  describe("GoTrue errors → es-MX (FC-19)", () => {
    const conError = (error: unknown) =>
      fakeSignUp(() => ({ data: { user: null, session: null }, error }));

    beforeEach(() => {
      vi.spyOn(console, "warn").mockImplementation(() => {});
    });

    it.each([
      ["over_email_send_rate_limit", "Ya enviamos varios correos"],
      ["email_address_invalid", "Ese correo no es válido"],
      ["weak_password", "Esa contraseña es muy débil"],
      ["signup_disabled", "El registro está cerrado"],
    ])("maps %s to Spanish", async (code, esperado) => {
      const client = conError({ code, status: 400, message: "Password should be at least…" });
      expect(await registrarSocio(alta(correo()), OPTS, client)).toEqual({
        ok: false,
        error: expect.stringContaining(esperado),
      });
    });

    it("maps a code-less 429 to the throttle message", async () => {
      const client = conError({ status: 429, message: "Too many requests" });
      expect(await registrarSocio(alta(correo()), OPTS, client)).toEqual({
        ok: false,
        error: expect.stringContaining("Ya enviamos varios correos"),
      });
    });

    it("falls back to Spanish for an unknown code — the raw English never reaches the form", async () => {
      const client = conError({ code: "codigo_nuevo", status: 500, message: "Database error" });
      const res = await registrarSocio(alta(correo()), OPTS, client);
      expect(res).toEqual({ ok: false, error: "No pudimos crear tu cuenta. Inténtalo de nuevo en unos minutos." });
    });

    it("logs the raw code/status server-side, and never the address", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const email = correo();
      const client = conError({ code: "weak_password", status: 422, message: "Password is too weak" });
      await registrarSocio(alta(email), OPTS, client);
      expect(warn).toHaveBeenCalledTimes(1);
      const linea = String(warn.mock.calls[0]?.[0]);
      expect(JSON.parse(linea)).toMatchObject({
        event: "registro-signup-error",
        code: "weak_password",
        status: 422,
      });
      expect(linea).not.toContain(email);
    });

    it("does not arm the throttle on a refused send (nothing was mailed)", async () => {
      const email = correo();
      let llamadas = 0;
      const client = fakeSignUp(() => {
        llamadas += 1;
        return llamadas === 1
          ? {
              data: { user: null, session: null },
              error: { code: "weak_password", status: 422, message: "weak" },
            }
          : usuarioNuevo();
      });
      expect((await registrarSocio(alta(email), OPTS, client)).ok).toBe(false);
      expect(await registrarSocio(alta(email), OPTS, client)).toEqual(NUEVO);
      expect(llamadas).toBe(2);
    });
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
