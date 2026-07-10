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
  redirectTo: "https://red-demo.ibookit.lat/auth/confirm",
  siteUrl: "https://red.ibookit.lat",
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

  it("empty redirectTo falls back to siteUrl/auth/confirm (defensive)", () => {
    const m = construirCorreoAuth({ ...BASE, redirectTo: "", emailActionType: "signup", gymNombre: null });
    const u = new URL(m.url);
    expect(u.host).toBe("red.ibookit.lat");
    expect(u.pathname).toBe("/auth/confirm");
    expect(u.searchParams.get("type")).toBe("email");
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
