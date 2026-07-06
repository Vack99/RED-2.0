import { describe, expect, it } from "vitest";

import { presentarEstadoReserva } from "./reserva-vista";

/**
 * The estado → booking-card vocabulary map (slice #56). Translates the domain
 * state ladder (@gym/domain EstadoSesion) into the mock's card presentation —
 * verified without rendering, since the client test env is node-only.
 */
describe("presentarEstadoReserva", () => {
  it("termino → a dimmed, un-bookable 'Terminó' card with an em-dash count", () => {
    const v = presentarEstadoReserva("termino", 8);
    expect(v).toEqual({
      tono: "finished",
      numero: "—",
      unidad: "terminada",
      cta: "Terminó",
      reservable: false,
      atenuada: true,
    });
  });

  it("lleno → a danger-toned 'Lleno', not bookable", () => {
    const v = presentarEstadoReserva("lleno", 0);
    expect(v.tono).toBe("full");
    expect(v.unidad).toBe("lleno");
    expect(v.cta).toBe("Lleno");
    expect(v.reservable).toBe(false);
    expect(v.atenuada).toBe(false);
  });

  it("normal → a bookable 'Reservar' card showing free spots", () => {
    const v = presentarEstadoReserva("normal", 12);
    expect(v).toEqual({
      tono: "open",
      numero: "12",
      unidad: "libres",
      cta: "Reservar",
      reservable: true,
      atenuada: false,
    });
  });

  it("singularizes the unit label at exactly one free spot", () => {
    expect(presentarEstadoReserva("normal", 1).unidad).toBe("libre");
  });

  it("a_continuacion is bookable and shows spots (the day's next class)", () => {
    const v = presentarEstadoReserva("a_continuacion", 5);
    expect(v.tono).toBe("open");
    expect(v.cta).toBe("Reservar");
    expect(v.reservable).toBe(true);
    expect(v.numero).toBe("5");
  });

  it("casi_lleno stays bookable (the occupancy bar carries the near-full signal)", () => {
    const v = presentarEstadoReserva("casi_lleno", 2);
    expect(v.tono).toBe("open");
    expect(v.cta).toBe("Reservar");
    expect(v.reservable).toBe(true);
  });
});
