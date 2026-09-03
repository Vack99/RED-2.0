import { derivarReservabilidad, type HechosReserva, type SaldoSocio } from "@gym/domain/reserva";
import { describe, expect, it } from "vitest";

import {
  badgeDeReserva,
  destinoClases,
  footerCtaVista,
  heroCtaVista,
  landingVista,
  LINEA_BLOQUEO,
  lineaCerrada,
  navClasesVista,
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

const CON_CLASES: SaldoSocio = {
  ilimitado: false,
  clasesRestantes: 5,
  vencido: false,
  reservasHabilitadas: true,
};

/** The gym's booking cutoff has already passed for this session (derived server-side). */
const CERRADA: Partial<HechosReserva> = { reservasCerradas: true };

function vista(p: Partial<HechosReserva>, disponibles: number) {
  return presentarEstadoReserva(
    derivarReservabilidad({
      estado: "normal",
      miReserva: false,
      saldo: CON_CLASES,
      otraEseDia: false,
      reservasCerradas: false,
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
    const v = vista({ saldo: { ...CON_CLASES, clasesRestantes: 0 } }, 12);
    expect(v.cta).toBe("Sin clases");
    expect(v.reservable).toBe(false);
    expect(v.atenuada).toBe(true);
    expect(v.tono).toBe("finished");
  });

  // gym.booking_enabled = false (the class-only gym): the card still shows the class so a member
  // can read the schedule, but never offers a spot `reservar_clase` would refuse outright.
  it("deshabilitada → the same dimmed lock, labelled 'Sin reserva'", () => {
    const v = vista({ saldo: { ...CON_CLASES, reservasHabilitadas: false } }, 12);
    expect(v.cta).toBe("Sin reserva");
    expect(v.unidad).toBe("sin reserva");
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

  it("cerrada → a dimmed, un-bookable card (the gym's cutoff passed for this class)", () => {
    const v = vista(CERRADA, 8);
    expect(v.tono).toBe("finished");
    expect(v.cta).toBe("Cerradas");
    expect(v.reservable).toBe(false);
    expect(v.atenuada).toBe(true);
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
      reservasCerradas: false,
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

  // Unlike vencido / sin_clases, the cutoff IS a fact about the class, so it renames the chip.
  it("cerrada → 'Reservas cerradas'", () => {
    expect(badge(CERRADA).texto).toBe("Reservas cerradas");
  });

  it("a member-side lock never renames the class — a seat is still 'Disponible'", () => {
    expect(badge({ saldo: { ...CON_CLASES, vencido: true } }).texto).toBe("Disponible");
    expect(badge({ saldo: { ...CON_CLASES, clasesRestantes: 0 } }).texto).toBe(
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
    expect(LINEA_BLOQUEO.deshabilitada).toContain("no toma reservas");
  });
});

/**
 * Modos Lista/Cupo (#332) — the member app's routing surface. Each function takes the
 * already-derived `Modo` (the caller runs `modo()` against its own `reservasHabilitadas`
 * once, review follow-up — no per-function re-derivation). Cupo must reproduce every
 * target/label the shipped drawer + login redirect already use verbatim (the e2e session
 * shield asserts them against red-demo) — these cases exist to pin that, not just to
 * cover Lista.
 */
describe("destinoClases", () => {
  it("Cupo aims at /reservar", () => {
    expect(destinoClases("cupo")).toBe("/reservar");
  });
  it("Lista aims at /saldo — no booking surface exists", () => {
    expect(destinoClases("lista")).toBe("/saldo");
  });
});

describe("navClasesVista", () => {
  it("Cupo: the drawer's 'Clases' row, tagged 'Hoy', at /reservar", () => {
    expect(navClasesVista("cupo")).toEqual({ label: "Clases", href: "/reservar", tag: "Hoy" });
  });
  it("Lista: 'Mi saldo' at /saldo, no tag", () => {
    expect(navClasesVista("lista")).toEqual({ label: "Mi saldo", href: "/saldo", tag: null });
  });
});

describe("footerCtaVista", () => {
  it("Cupo: 'Reservar clase' at /reservar", () => {
    expect(footerCtaVista("cupo")).toEqual({ label: "Reservar clase", href: "/reservar" });
  });
  it("Lista: 'Mi saldo' at /saldo — never 'Reservar' copy on a gym with no booking surface", () => {
    expect(footerCtaVista("lista")).toEqual({ label: "Mi saldo", href: "/saldo" });
  });
});

describe("heroCtaVista", () => {
  it("Cupo: 'Reservar clase' at /reservar", () => {
    expect(heroCtaVista("cupo")).toEqual({ label: "Reservar clase", href: "/reservar" });
  });
  it("Lista: 'Ver planes' at /precios — the landing's real primary action with no booking surface", () => {
    expect(heroCtaVista("lista")).toEqual({ label: "Ver planes", href: "/precios" });
  });
});

/**
 * The public landing's own composition gate (#332, code-review item 9): `lista` is the ONE
 * flag `(home)/page.tsx` uses to swap the schedule teaser for the hours/location/WhatsApp
 * arms — pinned here as the pure part of that composition, since the page body itself does
 * data fetching and JSX and is not itself unit-testable.
 */
describe("landingVista", () => {
  it("Cupo gym: not lista, keeps the schedule teaser, hero CTA aims at /reservar", () => {
    expect(landingVista({ bookingEnabled: true })).toEqual({
      lista: false,
      cta: { label: "Reservar clase", href: "/reservar" },
    });
  });

  it("Lista gym: lista, no schedule teaser, hero CTA aims at /precios — never 'Reservar' copy", () => {
    expect(landingVista({ bookingEnabled: false })).toEqual({
      lista: true,
      cta: { label: "Ver planes", href: "/precios" },
    });
  });

  it("no gym resolved (unmapped host): defaults to Cupo, same as every other pre-login read", () => {
    expect(landingVista(null)).toEqual({
      lista: false,
      cta: { label: "Reservar clase", href: "/reservar" },
    });
  });
});

describe("lineaCerrada", () => {
  it("names the moment bookings closed, so the member learns the gym's rule", () => {
    expect(lineaCerrada("lunes a las 22:00")).toBe(
      "Las reservas para esta clase cerraron el lunes a las 22:00. Si aún quieres entrar, escríbele al gym.",
    );
  });

  it("falls back to the un-timed line when no label rode along", () => {
    expect(lineaCerrada(null)).toBe(LINEA_BLOQUEO.cerrada);
  });
});
