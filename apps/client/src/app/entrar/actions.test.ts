import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * M1, closed. `entrarAction` minted a session and claimed NOTHING — the only retry was
 * `/reservar`'s self-heal, whose gate was gym-blind, so a member whose confirm-time claim
 * missed stayed unbound forever (the 09-03 hand-link: `last_sign_in_at` null for 5 days on
 * a row whose email matched perfectly). A password login is inbox-proof enough to bind.
 */
const iniciarSesion = vi.fn();
const reclamarEnHost = vi.fn();
const resolverMiembroGym = vi.fn();

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`REDIRECT:${url}`);
  },
}));
vi.mock("@gym/data/server/supabase", () => ({ createClient: async () => ({ id: "cliente" }) }));
vi.mock("@gym/data/server/sesion", () => ({
  iniciarSesion: (...a: unknown[]) => iniciarSesion(...a),
  reenviarConfirmacion: vi.fn(),
  solicitarReset: vi.fn(),
}));
vi.mock("@gym/data/server/inquilino", () => ({
  resolverMiembroGym: (...a: unknown[]) => resolverMiembroGym(...a),
}));
vi.mock("../../lib/reclamo", () => ({ reclamarEnHost: (...a: unknown[]) => reclamarEnHost(...a) }));

const { entrarAction } = await import("./actions");

function credenciales(): FormData {
  const fd = new FormData();
  fd.set("email", "socia@x.mx");
  fd.set("password", "sup3rsecreta");
  return fd;
}

beforeEach(() => {
  vi.clearAllMocks();
  reclamarEnHost.mockResolvedValue(true);
  resolverMiembroGym.mockResolvedValue({ reservasHabilitadas: true });
});

describe("entrarAction — claim on login", () => {
  it("runs the claim on the SAME client the login just established", async () => {
    iniciarSesion.mockResolvedValue({ ok: true });
    await expect(entrarAction({ status: "idle" }, credenciales())).rejects.toThrow("REDIRECT:/reservar");
    expect(reclamarEnHost).toHaveBeenCalledWith({ id: "cliente" });
  });

  it("claims BEFORE reading the membership — otherwise a just-bound member routes as a stranger", async () => {
    iniciarSesion.mockResolvedValue({ ok: true });
    const orden: string[] = [];
    reclamarEnHost.mockImplementation(async () => {
      orden.push("reclamo");
      return true;
    });
    resolverMiembroGym.mockImplementation(async () => {
      orden.push("membresia");
      return { reservasHabilitadas: false };
    });
    await expect(entrarAction({ status: "idle" }, credenciales())).rejects.toThrow("REDIRECT:/saldo");
    expect(orden).toEqual(["reclamo", "membresia"]);
  });

  it("never claims on a FAILED login — no session, no inbox proof", async () => {
    iniciarSesion.mockResolvedValue({ ok: false, error: "Correo o contraseña incorrectos" });
    const estado = await entrarAction({ status: "idle" }, credenciales());
    expect(estado).toMatchObject({ status: "error" });
    expect(reclamarEnHost).not.toHaveBeenCalled();
  });

  it("a refused claim never blocks the login (fail-soft → sin-membresía screen)", async () => {
    iniciarSesion.mockResolvedValue({ ok: true });
    reclamarEnHost.mockResolvedValue(false);
    resolverMiembroGym.mockResolvedValue(null);
    await expect(entrarAction({ status: "idle" }, credenciales())).rejects.toThrow("REDIRECT:/reservar");
  });
});
