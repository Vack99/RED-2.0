import { derivarReservabilidad, type HechosReserva, type SaldoSocio } from "@gym/domain/reserva";
import { describe, expect, it } from "vitest";

import {
  badgeDeReserva,
  LINEA_BLOQUEO,
  presentarAvisoReserva,
  presentarEstadoReserva,
} from "./reserva-vista";

/**
 * The verdict → member presentation map (slice #56/#57). The cascade itself is proven in
 * @gym/domain's reserva.test.ts; this file proves how each verdict READS — verified without
 * rendering, since the client test env is node-only. Every case goes through
 * `derivarReservabilidad`, so the presentation can never be exercised against a verdict the
 * engine would not produce.
 */

const CON_CLASES: SaldoSocio = { ilimitado: false, clasesRestantes: 5, vencido: false };

function vista(p: Partial<HechosReserva>, disponibles: number) {
  return presentarEstadoReserva(
    derivarReservabilidad({
      estado: "normal",
      miReserva: false,
      saldo: CON_CLASES,
      otraEseDia: false,
      ...p,
    }),
    disponibles,
  );
}

describe("presentarEstadoReserva", () => {
  it("terminada → a dimmed, un-bookable 'Terminó' card with an em-dash count", () => {
    expect(vista({ estado: "termino" }, 8)).toEqual({
      tono: "finished",
      numero: "—",
      unidad: "terminada",
      cta: "Terminó",
      reservable: false,
      reservada: false,
      atenuada: true,
    });
  });

  it("llena → a danger-toned 'Lleno', not bookable", () => {
    const v = vista({ estado: "lleno" }, 0);
    expect(v.tono).toBe("full");
    expect(v.unidad).toBe("lleno");
    expect(v.cta).toBe("Lleno");
    expect(v.reservable).toBe(false);
    expect(v.atenuada).toBe(false);
  });

  it("libre → a bookable 'Reservar' card showing free spots", () => {
    expect(vista({}, 12)).toEqual({
      tono: "open",
      numero: "12",
      unidad: "libres",
      cta: "Reservar",
      reservable: true,
      reservada: false,
      atenuada: false,
    });
  });

  it("reservada → an accent 'Reservada' chip, not bookable, spots still shown", () => {
    const v = vista({ miReserva: true }, 6);
    expect(v.tono).toBe("open");
    expect(v.unidad).toBe("reservada");
    expect(v.cta).toBe("Reservada");
    expect(v.reservable).toBe(false);
    expect(v.reservada).toBe(true);
  });

  it("a booked FULL class reads 'Reservada' (reservada outranks llena)", () => {
    const v = vista({ estado: "lleno", miReserva: true }, 0);
    expect(v.reservada).toBe(true);
    expect(v.cta).toBe("Reservada");
    expect(v.tono).toBe("open");
  });

  it("a booked PAST class stays 'Terminó' (terminada outranks reservada)", () => {
    const v = vista({ estado: "termino", miReserva: true }, 0);
    expect(v.cta).toBe("Terminó");
    expect(v.reservada).toBe(false);
    expect(v.atenuada).toBe(true);
  });

  it("singularizes the unit label at exactly one free spot", () => {
    expect(vista({}, 1).unidad).toBe("libre");
  });

  it("vencido → a dimmed, un-bookable 'Vencido' card (#118 E4) — no green 'Reservar' for a lapsed member", () => {
    const v = vista({ saldo: { ...CON_CLASES, vencido: true } }, 12);
    expect(v.cta).toBe("Vencido");
    expect(v.reservable).toBe(false);
    expect(v.atenuada).toBe(true);
    expect(v.tono).toBe("finished");
  });

  // The card used to lock on vencido but NOT on a spent balance, while the sheet behind it
  // refused both — a green "Reservar" it retracted one tap later. Same saldo, same RPC
  // refusal, same lock.
  it("sin_clases → the same dimmed lock as vencido, never a green 'Reservar'", () => {
    const v = vista({ saldo: { ilimitado: false, clasesRestantes: 0, vencido: false } }, 12);
    expect(v.cta).toBe("Sin clases");
    expect(v.reservable).toBe(false);
    expect(v.atenuada).toBe(true);
    expect(v.tono).toBe("finished");
  });

  it("a booked class outranks vencido — a member who reserved before lapsing keeps 'Reservada'", () => {
    const v = vista({ miReserva: true, saldo: { ...CON_CLASES, vencido: true } }, 6);
    expect(v.cta).toBe("Reservada");
    expect(v.reservada).toBe(true);
  });

  it("a_continuacion is bookable and shows spots (the day's next class)", () => {
    const v = vista({ estado: "a_continuacion" }, 5);
    expect(v.tono).toBe("open");
    expect(v.cta).toBe("Reservar");
    expect(v.reservable).toBe(true);
    expect(v.numero).toBe("5");
  });

  it("casi_lleno stays bookable (the occupancy bar carries the near-full signal)", () => {
    const v = vista({ estado: "casi_lleno" }, 2);
    expect(v.tono).toBe("open");
    expect(v.cta).toBe("Reservar");
    expect(v.reservable).toBe(true);
  });
});

describe("badgeDeReserva", () => {
  function badge(p: Partial<HechosReserva> = {}) {
    const h: HechosReserva = {
      estado: "normal",
      miReserva: false,
      saldo: CON_CLASES,
      otraEseDia: false,
      ...p,
    };
    return badgeDeReserva(derivarReservabilidad(h), h.estado);
  }

  it("names the class state: Terminada / Reservada / Llena / Disponible", () => {
    expect(badge({ estado: "termino" }).texto).toBe("Terminada");
    expect(badge({ miReserva: true }).texto).toBe("Reservada");
    expect(badge({ estado: "lleno" }).texto).toBe("Llena");
    expect(badge({}).texto).toBe("Disponible");
  });

  // The class page's own copy of this badge had no casi_lleno arm and read "Disponible"
  // where the week's sheet read "Pocos lugares" for the same session.
  it("casi_lleno → 'Pocos lugares' (both surfaces, one home)", () => {
    expect(badge({ estado: "casi_lleno" }).texto).toBe("Pocos lugares");
  });

  it("a member-side lock never renames the class — a seat is still 'Disponible'", () => {
    expect(badge({ saldo: { ...CON_CLASES, vencido: true } }).texto).toBe("Disponible");
    expect(badge({ saldo: { ilimitado: false, clasesRestantes: 0, vencido: false } }).texto).toBe(
      "Disponible",
    );
  });
});

describe("presentarAvisoReserva", () => {
  const ctx = { clasesRestantes: 5, disponibles: 2, esHoy: false };

  it("consume_una names the balance the tap spends from", () => {
    expect(presentarAvisoReserva("consume_una", ctx)).toEqual({
      texto: "Esta reserva usa 1 de tus 5 clases",
      urgente: false,
    });
  });

  it("ilimitado says the booking costs nothing", () => {
    expect(presentarAvisoReserva("ilimitado", ctx).texto).toBe(
      "Reserva incluida en tu plan ilimitado.",
    );
  });

  it("casi_llena is the one urgent (warning-toned) line, singularized at one seat", () => {
    expect(presentarAvisoReserva("casi_llena", ctx)).toEqual({
      texto: "Solo 2 libres · asegura tu lugar",
      urgente: true,
    });
    expect(presentarAvisoReserva("casi_llena", { ...ctx, disponibles: 1 }).texto).toBe(
      "Solo 1 libre · asegura tu lugar",
    );
  });

  it("otra_ese_dia says 'hoy' only when the session's day IS today (#89 W3)", () => {
    expect(presentarAvisoReserva("otra_ese_dia", { ...ctx, esHoy: true }).texto).toBe(
      "Ya tienes una clase hoy — esta usará otra de tus 5 clases.",
    );
    expect(presentarAvisoReserva("otra_ese_dia", ctx).texto).toBe(
      "Ya tienes una clase ese día — esta usará otra de tus 5 clases.",
    );
  });
});

describe("LINEA_BLOQUEO", () => {
  it("carries one wording per refusal, so the two surfaces cannot phrase it differently", () => {
    expect(LINEA_BLOQUEO.terminada).toBe("Esta clase ya pasó.");
    expect(LINEA_BLOQUEO.llena).toBe("Clase llena. No hay lugares disponibles.");
    expect(LINEA_BLOQUEO.vencido).toContain("Tu paquete venció");
    expect(LINEA_BLOQUEO.sin_clases).toContain("No te quedan clases");
  });
});
