import { describe, expect, it } from "vitest";

import { copiaAgregar, puedeCancelarReserva, rosterResumen } from "./session-roster";

/**
 * The roster headline: how many booked members are actually marked present out of
 * the whole list (booked + walk-ins). `present` is the only field that matters.
 */
describe("rosterResumen", () => {
  it("counts present against the full roster", () => {
    expect(rosterResumen([{ present: true }, { present: false }, { present: true }])).toEqual({ presentes: 2, total: 3 });
  });
  it("is zero/zero for an empty roster", () => {
    expect(rosterResumen([])).toEqual({ presentes: 0, total: 0 });
  });
  it("counts a fully-marked class", () => {
    expect(rosterResumen([{ present: true }, { present: true }])).toEqual({ presentes: 2, total: 2 });
  });
});

/**
 * The sheet has ONE add affordance whose verb follows the tense (#238). This is where a
 * correct rule wired to the wrong copy would show: the button and the empty state must name
 * the same action, always, because they are cut from the same word.
 */
describe("copiaAgregar", () => {
  it("reads RESERVA until the class starts — the tap will book (owner ruling 2026-09-02)", () => {
    expect(copiaAgregar(true)).toEqual({
      boton: "Agregar reserva",
      vacio: "Nadie reservó todavía · agrega una reserva",
    });
  });

  it("reads VISITA from the start instant on — the tap records an arrival", () => {
    expect(copiaAgregar(false)).toEqual({
      boton: "Agregar visita",
      vacio: "Nadie reservó todavía · agrega una visita",
    });
  });

  // The collapse (review 2026-09-02): the roster now derives this from `!claseIniciada` — the
  // SAME bit that hides the cancel ×. One bit means the button can never offer RESERVA on a
  // class the cancel gate already treats as started.
  it("is the exact negation of claseIniciada — one bit, so the two affordances agree", () => {
    for (const claseIniciada of [true, false]) {
      expect(copiaAgregar(!claseIniciada).boton).toBe(claseIniciada ? "Agregar visita" : "Agregar reserva");
      expect(puedeCancelarReserva({ present: false }, claseIniciada)).toBe(!claseIniciada);
    }
  });

  it("keeps the empty state and the button on the same verb — they can never contradict", () => {
    for (const antes of [true, false]) {
      const { boton, vacio } = copiaAgregar(antes);
      expect(vacio).toContain(boton.split(" ")[1]);
    }
  });
});

/**
 * The operator's undo appears on booked-not-present rows of a class that has not started.
 * Charging is at booking, so this is the only affordance that gives a mis-tapped member their
 * class back — and its visibility must track the RPC's OWN gate (`starts_at <= now()`), not
 * the arrival window's close, or the button renders through a band where every tap fails.
 */
describe("puedeCancelarReserva", () => {
  it("shows on a reserva still awaiting its member, before the class starts", () => {
    expect(puedeCancelarReserva({ present: false }, false)).toBe(true);
  });

  it("hides on a row already marked present — the present-toggle owns that removal", () => {
    expect(puedeCancelarReserva({ present: true }, false)).toBe(false);
  });

  it("hides from the start instant onward — the RPC refuses a cancel once the class began", () => {
    expect(puedeCancelarReserva({ present: false }, true)).toBe(false);
    expect(puedeCancelarReserva({ present: true }, true)).toBe(false);
  });
});
