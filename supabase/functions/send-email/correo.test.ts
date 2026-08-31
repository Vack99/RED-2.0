import { describe, expect, it } from "vitest";

import { construirCorreoAuth, respuestaEnvio } from "./correo";

/**
 * The pure decision core (issue #75). No Deno, no Resend, no signature: we assert
 * the mail the hook WOULD send — subject/copy per action type × gym/neutral, the
 * minted link (host preserved, `codigo`/`next` preserved, `token_hash`+`type`
 * appended, the type mapping), the From display name — and the full
 * `respuestaEnvio` matrix (AC6).
 */

const BASE = {
  tokenHash: "hash-123",
  // Empty by default: the existing subject/copy/link/From cases below don't care
  // about the OTP-code fallback block, and an empty token is `bloqueCodigo`'s
  // no-render case anyway. The dedicated describe block below opts individual
  // cases into a real 6-digit token.
  token: "",
  redirectTo: "https://red-demo.ibookit.lat/auth/confirm",
};

describe("construirCorreoAuth — subject + copy per action type", () => {
  it("signup, gym resolved: fixed subject, gym name woven into the body, CONFIRMAR button", () => {
    const m = construirCorreoAuth({ ...BASE, emailActionType: "signup", gymNombre: "Forge" });
    expect(m.subject).toBe("Confirma tu cuenta");
    expect(m.html).toContain("<strong>Forge</strong>");
    expect(m.html).toContain("crear tu cuenta en <strong>Forge</strong>");
    expect(m.text).toContain("crear tu cuenta en Forge");
    expect(m.html).toContain("CONFIRMAR MI CUENTA");
    expect(m.html).toContain("Si no creaste esta cuenta");
  });

  it("signup, no gym: neutral copy carries no gym name", () => {
    const m = construirCorreoAuth({ ...BASE, emailActionType: "signup", gymNombre: null });
    expect(m.subject).toBe("Confirma tu cuenta");
    expect(m.html).not.toContain("<strong>");
    expect(m.html).toContain("crear tu cuenta con este correo");
  });

  it("recovery, gym resolved: reset subject, gym name in copy, RESTABLECER button", () => {
    const m = construirCorreoAuth({ ...BASE, emailActionType: "recovery", gymNombre: "RED" });
    expect(m.subject).toBe("Restablece tu contraseña");
    expect(m.html).toContain("la contraseña de tu cuenta de <strong>RED</strong>");
    expect(m.html).toContain("RESTABLECER MI CONTRASEÑA");
    expect(m.html).toContain("tu contraseña seguirá igual");
  });

  it("recovery, no gym: neutral reset copy", () => {
    const m = construirCorreoAuth({ ...BASE, emailActionType: "recovery", gymNombre: null });
    expect(m.subject).toBe("Restablece tu contraseña");
    expect(m.html).not.toContain("<strong>");
    expect(m.html).toContain("restablecer la contraseña de tu cuenta.");
  });

  it("unknown action type: generic voice, never an error", () => {
    const m = construirCorreoAuth({ ...BASE, emailActionType: "reauthentication", gymNombre: "Forge" });
    expect(m.subject).toBe("Continúa en tu cuenta");
    expect(m.html).toContain("<strong>Forge</strong>");
    expect(m.html).toContain("CONTINUAR");
  });
});

describe("construirCorreoAuth — the minted link", () => {
  it("preserves the existing `codigo` query and appends token_hash + type=email (signup)", () => {
    const m = construirCorreoAuth({
      ...BASE,
      redirectTo: "https://red-demo.ibookit.lat/auth/confirm?codigo=ABC23456",
      emailActionType: "signup",
      gymNombre: "RED",
    });
    const u = new URL(m.url);
    expect(u.host).toBe("red-demo.ibookit.lat");
    expect(u.pathname).toBe("/auth/confirm");
    expect(u.searchParams.get("codigo")).toBe("ABC23456");
    expect(u.searchParams.get("token_hash")).toBe("hash-123");
    expect(u.searchParams.get("type")).toBe("email");
  });

  it("preserves the existing `next` query and maps recovery → type=recovery", () => {
    const m = construirCorreoAuth({
      ...BASE,
      redirectTo: "https://red.ibookit.lat/auth/confirm?next=/restablecer",
      emailActionType: "recovery",
      gymNombre: null,
    });
    const u = new URL(m.url);
    expect(u.searchParams.get("next")).toBe("/restablecer");
    expect(u.searchParams.get("token_hash")).toBe("hash-123");
    expect(u.searchParams.get("type")).toBe("recovery");
  });

  it("never mints on the Supabase verify host — the link stays on the gym's host", () => {
    const m = construirCorreoAuth({ ...BASE, emailActionType: "signup", gymNombre: "RED" });
    expect(m.url.startsWith("https://red-demo.ibookit.lat/auth/confirm")).toBe(true);
    expect(m.url).not.toContain("/auth/v1/verify");
  });

  it("email_change maps to type=email_change", () => {
    const m = construirCorreoAuth({ ...BASE, emailActionType: "email_change", gymNombre: null });
    expect(new URL(m.url).searchParams.get("type")).toBe("email_change");
  });

  it("magiclink and unknown types both map to type=email", () => {
    for (const action of ["magiclink", "email", "totally-unknown"]) {
      const m = construirCorreoAuth({ ...BASE, emailActionType: action, gymNombre: null });
      expect(new URL(m.url).searchParams.get("type")).toBe("email");
    }
  });

  it("empty redirectTo fails closed instead of defaulting to the global Site URL (#217)", () => {
    expect(() =>
      construirCorreoAuth({ ...BASE, redirectTo: "", emailActionType: "signup", gymNombre: null }),
    ).toThrow();
  });

  it("malformed (non-empty, unparseable) redirectTo also fails closed", () => {
    expect(() =>
      construirCorreoAuth({
        ...BASE,
        redirectTo: "not-a-url",
        emailActionType: "signup",
        gymNombre: null,
      }),
    ).toThrow();
  });

  it("a redirectTo whose path isn't /auth/confirm fails closed (fix 5 — 2026-08-30 shield plan: a Site-URL-clamped bare-origin link must become a loud non-send, never a mis-minted cross-tenant mail)", () => {
    expect(() =>
      construirCorreoAuth({
        ...BASE,
        redirectTo: "https://red.ibookit.lat/",
        emailActionType: "signup",
        gymNombre: null,
      }),
    ).toThrow();
    expect(() =>
      construirCorreoAuth({
        ...BASE,
        redirectTo: "https://red.ibookit.lat/entrar",
        emailActionType: "recovery",
        gymNombre: null,
      }),
    ).toThrow();
  });

  it("still mints normally when /auth/confirm carries an existing query (not a bare-origin clamp)", () => {
    expect(() =>
      construirCorreoAuth({
        ...BASE,
        redirectTo: "https://red-demo.ibookit.lat/auth/confirm?codigo=ABC23456",
        emailActionType: "signup",
        gymNombre: null,
      }),
    ).not.toThrow();
  });
});

describe("construirCorreoAuth — the OTP-code fallback (fix 5b, 2026-08-30 shield plan)", () => {
  it("confirmation-type mail (signup) with a token renders the code block in html and text", () => {
    const m = construirCorreoAuth({
      ...BASE,
      token: "123456",
      emailActionType: "signup",
      gymNombre: null,
    });
    expect(m.html).toContain("Escribe este código en la página de acceso");
    expect(m.html).toContain("123456");
    expect(m.text).toContain("Escribe este código en la página de acceso: 123456");
  });

  it("the code block carries no hardcoded URL or host — generic wording only", () => {
    const m = construirCorreoAuth({
      ...BASE,
      token: "123456",
      emailActionType: "signup",
      gymNombre: null,
    });
    const bloque = m.html.slice(m.html.indexOf("página de acceso"));
    expect(bloque).not.toContain("http");
    expect(bloque).not.toContain("ibookit.lat");
  });

  it("magiclink and unknown types never render the code block — the invite rail's claim must not be skippable via /codigo (fable #6)", () => {
    for (const action of ["magiclink", "totally-unknown"]) {
      const m = construirCorreoAuth({ ...BASE, token: "654321", emailActionType: action, gymNombre: null });
      expect(m.html).not.toContain("654321");
      expect(m.text).not.toContain("página de acceso");
    }
  });

  it("recovery mail never renders the code block, even with a valid token — different next step than \"type this on the access page\"", () => {
    const m = construirCorreoAuth({
      ...BASE,
      token: "123456",
      emailActionType: "recovery",
      gymNombre: null,
    });
    expect(m.html).not.toContain("página de acceso");
    expect(m.text).not.toContain("página de acceso");
  });

  it("email_change mail never renders the code block, even with a valid token", () => {
    const m = construirCorreoAuth({
      ...BASE,
      token: "123456",
      emailActionType: "email_change",
      gymNombre: null,
    });
    expect(m.html).not.toContain("página de acceso");
  });

  it("no token (empty string) on confirmation-type mail: no block, no crash", () => {
    const m = construirCorreoAuth({ ...BASE, token: "", emailActionType: "signup", gymNombre: null });
    expect(m.html).not.toContain("página de acceso");
  });

  it("malformed (non-6-digit) token on confirmation-type mail: no block, no crash", () => {
    for (const token of ["12345", "1234567", "abcdef", "12 456"]) {
      const m = construirCorreoAuth({ ...BASE, token, emailActionType: "signup", gymNombre: null });
      expect(m.html).not.toContain("página de acceso");
    }
  });
});

describe("construirCorreoAuth — the From display name", () => {
  it("gym resolved → the gym name on the platform address", () => {
    const m = construirCorreoAuth({ ...BASE, emailActionType: "signup", gymNombre: "Forge" });
    expect(m.from).toBe("Forge <no-reply@ibookit.lat>");
  });

  it("no gym → the neutral Notificaciones sender", () => {
    const m = construirCorreoAuth({ ...BASE, emailActionType: "signup", gymNombre: null });
    expect(m.from).toBe("Notificaciones <no-reply@ibookit.lat>");
  });
});

describe("respuestaEnvio — the send-outcome → HTTP matrix (AC6)", () => {
  it("2xx → 200 `{}` (sent) — GoTrue parses every hook response as JSON; an empty body rolls back the auth action after the mail went out", () => {
    expect(respuestaEnvio(200)).toEqual({ status: 200, body: "{}" });
    expect(respuestaEnvio(202)).toEqual({ status: 200, body: "{}" });
  });

  it("null (network) → 503 so Supabase retries", () => {
    const r = respuestaEnvio(null);
    expect(r.status).toBe(503);
    expect(JSON.parse(r.body)).toEqual({ error: { http_code: 503, message: expect.any(String) } });
  });

  it("429 → 503 (retryable)", () => {
    expect(respuestaEnvio(429).status).toBe(503);
  });

  it("5xx → 503 (retryable)", () => {
    expect(respuestaEnvio(500).status).toBe(503);
    expect(respuestaEnvio(503).status).toBe(503);
  });

  it("other 4xx → 200 `{}` DROP (retry can't fix a config bug; must not brick signup)", () => {
    expect(respuestaEnvio(400)).toEqual({ status: 200, body: "{}" });
    expect(respuestaEnvio(422)).toEqual({ status: 200, body: "{}" });
    expect(respuestaEnvio(403)).toEqual({ status: 200, body: "{}" });
  });
});
