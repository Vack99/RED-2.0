import { describe, expect, it, vi } from "vitest";

/**
 * The data-seam assertion for #329: on a Lista gym the desk must never ISSUE the
 * day-agenda or reservations reads at all — not catch a failure, not receive an empty
 * result, simply never call them. `Page` (a server component) is an ordinary async
 * function, so it's called directly and its returned element's props are inspected
 * without rendering — the same shape `AsistenciaScreen` receives. Cupo is pinned in the
 * same file so a future change to this branch can't silently widen and break the
 * schedule-driven desk (#89/#237's pills, cooldown, CON RESERVA grouping).
 */

const getAgendaDia = vi.fn();
const getReservasDelDia = vi.fn();
const getMarcadas = vi.fn();
const getClientesParaPase = vi.fn();
const getOperatorGym = vi.fn();

vi.mock("@gym/data/server/agenda", () => ({
  getAgendaDia: (...args: unknown[]) => getAgendaDia(...args),
}));
vi.mock("@gym/data/server/asistencia", () => ({
  getMarcadas: (...args: unknown[]) => getMarcadas(...args),
  getReservasDelDia: (...args: unknown[]) => getReservasDelDia(...args),
}));
vi.mock("@gym/data/server/clientes", () => ({
  getClientesParaPase: (...args: unknown[]) => getClientesParaPase(...args),
}));
vi.mock("@gym/data/server/gym", () => ({
  getOperatorGym: (...args: unknown[]) => getOperatorGym(...args),
}));

const TZ = "America/Chihuahua";

describe("asistencia Page — Lista is ACCESO LIBRE by mode (#329)", () => {
  it("issues NO agenda or reservations read on a Lista gym, and opens on LIBRE with no sesiones", async () => {
    getOperatorGym.mockResolvedValue({ timezone: TZ, bookingEnabled: false });
    getClientesParaPase.mockResolvedValue([]);
    getMarcadas.mockResolvedValue([]);

    const { default: Page } = await import("./page");
    const el = (await Page({ searchParams: Promise.resolve({}) })) as unknown as { props: Record<string, unknown> };

    expect(getAgendaDia).not.toHaveBeenCalled();
    expect(getReservasDelDia).not.toHaveBeenCalled();
    expect(el.props.sesiones).toEqual([]);
    expect(el.props.reservas).toEqual({});
    expect(el.props.reservaAtribuible).toEqual({});
    expect(el.props.ctxInicial).toBe("libre");
  });

  it("still issues the agenda read on a Cupo gym (unchanged behavior)", async () => {
    vi.resetModules();
    getOperatorGym.mockResolvedValue({ timezone: TZ, bookingEnabled: true });
    getClientesParaPase.mockResolvedValue([]);
    getMarcadas.mockResolvedValue([]);
    getAgendaDia.mockResolvedValue({ sesiones: [] });

    const { default: Page } = await import("./page");
    await Page({ searchParams: Promise.resolve({}) });

    expect(getAgendaDia).toHaveBeenCalledTimes(1);
  });
});
