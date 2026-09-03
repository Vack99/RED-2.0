import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The claim-on-mint seam (design 2026-09-03 §3, A1/A2). Before this the claim ran at
 * exactly ONE moment — `/auth/confirm`'s plain-signup arm — and the two doors that mint a
 * session without passing it (password login, `/codigo`) delegated to a self-heal whose
 * gate was gym-blind. A miss was permanent and silent (M1/M2/M3; the 09-03 hand-link).
 *
 * What is pinned here: the RPC is CALLED on every mint, in the HOST-resolved gym, and a
 * refusal is a VALUE — it never throws out of the helper, because a claim that fails must
 * never keep a verified member from landing.
 */
const intentarReclamoPorEmail = vi.fn();
const resolveTenant = vi.fn();
const avisoVersionParaGym = vi.fn();

vi.mock("next/headers", () => ({ headers: async () => new Headers({ host: "red.example" }) }));
vi.mock("@gym/data/server/registro", () => ({
  intentarReclamoPorEmail: (...a: unknown[]) => intentarReclamoPorEmail(...a),
}));
vi.mock("@gym/data/server/resolve-tenant", () => ({
  resolveTenant: (...a: unknown[]) => resolveTenant(...a),
}));
vi.mock("@gym/data/server/marketing", () => ({ getMarketingGym: async () => ({ slug: "red" }) }));
vi.mock("./aviso-legal", () => ({
  avisoVersionParaGym: (...a: unknown[]) => avisoVersionParaGym(...a),
}));

const { reclamarEnHost } = await import("./reclamo");

beforeEach(() => {
  vi.clearAllMocks();
  resolveTenant.mockResolvedValue({ id: "gym-1", slug: "red" });
  intentarReclamoPorEmail.mockResolvedValue({ ok: true });
  avisoVersionParaGym.mockResolvedValue("0.1");
});

describe("reclamarEnHost", () => {
  it("runs the claim in the HOST-resolved gym, stamping no aviso by default", async () => {
    expect(await reclamarEnHost({} as never)).toBe(true);
    expect(intentarReclamoPorEmail).toHaveBeenCalledWith("gym-1", null, {});
  });

  it("stamps the gym's aviso version only where the door actually rendered one", async () => {
    await reclamarEnHost({} as never, { conAviso: true });
    expect(intentarReclamoPorEmail).toHaveBeenCalledWith("gym-1", "0.1", {});
  });

  it("is a no-op on an unmapped host — there is no gym to claim into", async () => {
    resolveTenant.mockResolvedValue(null);
    expect(await reclamarEnHost({} as never)).toBe(false);
    expect(intentarReclamoPorEmail).not.toHaveBeenCalled();
  });

  it("reports a refusal as a value and logs it — nothing matched is not an error", async () => {
    intentarReclamoPorEmail.mockResolvedValue({ ok: false, motivo: "Sin registro en este gimnasio" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await reclamarEnHost({} as never)).toBe(false);
    expect(JSON.parse(String(warn.mock.calls[0]?.[0]))).toMatchObject({ event: "reclamo-fallo" });
    warn.mockRestore();
  });

  it("swallows a blown-up tenant/aviso lookup — a claim never blocks a mint", async () => {
    resolveTenant.mockRejectedValue(new Error("boom"));
    expect(await reclamarEnHost({} as never)).toBe(false);
  });
});
