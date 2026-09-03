import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "./route";

/**
 * The catch-all this route used to be is what made the 2026-08-30 wedge unexplainable:
 * four structurally distinct failures (no params / unusable `type` / PKCE reject / OTP
 * reject) redirected to one `?error=confirmacion` with zero log lines, so neither the
 * member's screen nor the platform's logs could tell them apart (FC-03).
 *
 * This pins both halves of the fix: a DISTINCT `?error=` per motivo, and EXACTLY ONE
 * structured log line per exit that never carries the token. Success paths are out of
 * scope here — they need a live session; the failure exits are what regressed.
 */
vi.mock("@gym/data/server/supabase", () => ({ createClient: async () => ({}) }));

const reclamarEnHost = vi.fn();
vi.mock("../../../lib/reclamo", () => ({
  reclamarEnHost: (...args: unknown[]) => reclamarEnHost(...args),
}));

const confirmarCodigo = vi.fn();
const confirmarTokenHash = vi.fn();
vi.mock("@gym/data/server/sesion", () => ({
  confirmarCodigo: (...args: unknown[]) => confirmarCodigo(...args),
  confirmarTokenHash: (...args: unknown[]) => confirmarTokenHash(...args),
}));

const RECHAZO = { ok: false as const, error: "Token has expired", code: "otp_expired", status: 403 };

let lineas: string[] = [];

beforeEach(() => {
  lineas = [];
  vi.spyOn(console, "warn").mockImplementation((...args: unknown[]) => {
    lineas.push(String(args[0]));
  });
  confirmarCodigo.mockResolvedValue(RECHAZO);
  confirmarTokenHash.mockResolvedValue(RECHAZO);
  reclamarEnHost.mockResolvedValue(true);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

async function llamar(query: string): Promise<string | null> {
  const res = await GET(new NextRequest(`https://red.example/auth/confirm${query}`));
  const destino = new URL(res.headers.get("location") ?? "", "https://red.example");
  return destino.searchParams.get("error");
}

describe("/auth/confirm — one motivo per failure exit", () => {
  it.each([
    ["?next=/restablecer", "sin-token"],
    ["?token_hash=hash-1&type=magiclink", "tipo-no-soportado"],
    ["?code=pkce-1", "code-rechazado"],
    ["?token_hash=hash-1&type=email", "token-rechazado"],
  ])("%s lands on ?error=%s with exactly one log line", async (query, motivo) => {
    expect(await llamar(query)).toBe(motivo);
    expect(lineas).toHaveLength(1);
    expect(JSON.parse(lineas[0] ?? "")).toMatchObject({ event: "confirm-fallo", motivo });
  });

  it("logs the underlying GoTrue code/status/message — 'expired' vs 'already used' is the whole point", async () => {
    await llamar("?token_hash=hash-1&type=email");

    expect(JSON.parse(lineas[0] ?? "")).toMatchObject({
      motivo: "token-rechazado",
      tipo: "email",
      code: "otp_expired",
      status: 403,
      error: "Token has expired",
    });
  });

  it("never writes the token or the code into the log", async () => {
    await llamar("?token_hash=secreto-token&type=email");
    await llamar("?code=secreto-code");

    expect(lineas.join("|")).not.toContain("secreto-token");
    expect(lineas.join("|")).not.toContain("secreto-code");
  });

  // A hook-minted link always carries `type`; an absent one means the URL lost a param in
  // transit, and discarding a usable token_hash over it is a self-inflicted dead end.
  it.each(["?token_hash=hash-1", "?token_hash=hash-1&type="])(
    "defaults a missing/emptied type to 'email' instead of discarding the token_hash (%s)",
    async (query) => {
      expect(await llamar(query)).toBe("token-rechazado");

      expect(confirmarTokenHash).toHaveBeenCalledWith("email", "hash-1", expect.anything());
    },
  );

  it("refuses an unusable type WITHOUT spending the token on a verify call", async () => {
    await llamar("?token_hash=hash-1&type=magiclink");

    expect(confirmarTokenHash).not.toHaveBeenCalled();
  });
});

/**
 * M3, closed. The claim used to be skipped whenever a `next` rode the URL (`else if (!next)`),
 * so a member who reset their password first — or landed on any `next`-bearing link — minted a
 * session that bound nothing, forever. The claim is link-only now (R1), so running it on a
 * recovery cannot conjure a membership; skipping it is what stranded people.
 */
describe("/auth/confirm — the claim runs on EVERY session mint", () => {
  async function destino(query: string): Promise<string> {
    const res = await GET(new NextRequest(`https://red.example/auth/confirm${query}`));
    return new URL(res.headers.get("location") ?? "", "https://red.example").pathname;
  }

  it("claims on a plain signup confirmation and lands on the panel", async () => {
    confirmarTokenHash.mockResolvedValue({ ok: true });
    expect(await destino("?token_hash=h&type=email")).toBe("/reservar");
    expect(reclamarEnHost).toHaveBeenCalledWith({}, { conAviso: true });
  });

  it("claims on a RECOVERY mint too, then still honors ?next (M3)", async () => {
    confirmarTokenHash.mockResolvedValue({ ok: true });
    expect(await destino("?token_hash=h&type=recovery&next=/restablecer")).toBe("/restablecer");
    expect(reclamarEnHost).toHaveBeenCalledTimes(1);
  });

  it("claims on the PKCE arm as well", async () => {
    confirmarCodigo.mockResolvedValue({ ok: true });
    expect(await destino("?code=pkce-1")).toBe("/reservar");
    expect(reclamarEnHost).toHaveBeenCalledTimes(1);
  });

  it("a refused claim still lands the verified member (fail-soft)", async () => {
    confirmarCodigo.mockResolvedValue({ ok: true });
    reclamarEnHost.mockResolvedValue(false);
    expect(await destino("?code=pkce-1")).toBe("/reservar");
  });
});
