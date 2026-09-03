import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * M5, closed (owner ruling R2). `/activar` on an address that already has an account used to
 * send a magic link — a SECOND mail into the same GoTrue per-address bucket the member had
 * usually just spent at `/registro`. 32 s after her signup, that is exactly what Marce hit:
 * 429 `over_email_send_rate_limit` → "NO SALIÓ EL CORREO" → a reload button that walked back
 * into the same 60 s window.
 *
 * The rail is deleted. This pins the property that matters: NOTHING is sent, and the screen
 * gets the address so it can hand over a prefilled login instead of an inbox errand.
 */
const iniciarActivacion = vi.fn();
const intentarReclamoPorCodigo = vi.fn();
const verificarTurnstile = vi.fn();

vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "red.example" }) }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@gym/data/server/activacion", () => ({
  iniciarActivacion: (...a: unknown[]) => iniciarActivacion(...a),
}));
vi.mock("@gym/data/server/registro", () => ({
  intentarReclamoPorCodigo: (...a: unknown[]) => intentarReclamoPorCodigo(...a),
  parseCodigoInvitacion: (raw: unknown) =>
    typeof raw === "string" && /^[A-Z2-9]{8}$/.test(raw) ? raw : null,
}));
vi.mock("../../lib/turnstile", () => ({
  verificarTurnstile: (...a: unknown[]) => verificarTurnstile(...a),
}));

const sesion = await import("@gym/data/server/sesion");
const { activarAction } = await import("./actions");

function invitacion(): FormData {
  const fd = new FormData();
  fd.set("codigo", "ABCD2345");
  fd.set("email", "socia@x.mx");
  fd.set("cf-turnstile-response", "token");
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  verificarTurnstile.mockResolvedValue(true);
});

describe("activarAction — an existing account is told to log in, not mailed", () => {
  it("answers cuentaExistente carrying the address, and sends nothing", async () => {
    iniciarActivacion.mockResolvedValue({ ok: false, error: "cuenta_existente" });

    expect(await activarAction({ status: "idle" }, invitacion())).toEqual({
      status: "cuentaExistente",
      correo: "socia@x.mx",
    });
  });

  it("the magic-link sender no longer exists at all — the rail cannot be re-entered by accident", () => {
    expect("enviarMagicLink" in sesion).toBe(false);
  });

  it("the fresh-provision rail is untouched: a provisioned session still sets a password", async () => {
    iniciarActivacion.mockResolvedValue({ ok: true });
    await expect(activarAction({ status: "idle" }, invitacion())).rejects.toThrow(
      "REDIRECT:/activar/contrasena?codigo=ABCD2345",
    );
  });
});
