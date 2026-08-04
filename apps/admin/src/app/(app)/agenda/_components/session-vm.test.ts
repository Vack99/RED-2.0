import { describe, expect, it } from "vitest";

import type { SesionAgendaDTO } from "@gym/data/server/agenda";

import { accionAgregar, toCardVM } from "./session-vm";

/**
 * The page's DTO -> card/row view model. The DAL derives a 5-value domain estado
 * (incl. `a_continuacion`); the #41 primitives take a 4-value UI estado plus an
 * orthogonal `isNext` accent, so this pure seam bridges the two — plus the coach
 * join and the ★-especial selection. Isolated + tested (the page itself is not).
 */

function dto(over: Partial<SesionAgendaDTO> = {}): SesionAgendaDTO {
  return {
    id: "s1",
    startsAt: new Date("2026-06-17T14:00:00Z"),
    duracionMin: 45,
    capacidad: 24,
    activos: 0,
    disponibles: 24,
    estado: "normal",
    tipo: "Funcional",
    esEspecial: false,
    nombreEspecial: null,
    muestraEspecial: false,
    roomId: null,
    coaches: [],
    ...over,
  };
}

describe("toCardVM", () => {
  it("maps a_continuacion to UI estado 'normal' with isNext true", () => {
    const vm = toCardVM(dto({ estado: "a_continuacion" }), "08:15");
    expect(vm.estado).toBe("normal");
    expect(vm.isNext).toBe(true);
  });

  it.each(["normal", "casi_lleno", "lleno", "termino"] as const)(
    "passes the 4-value estado '%s' through with isNext false",
    (estado) => {
      const vm = toCardVM(dto({ estado }), "08:15");
      expect(vm.estado).toBe(estado);
      expect(vm.isNext).toBe(false);
    },
  );

  it("joins multiple coaches into a comma label and keeps their ids for the editor", () => {
    const vm = toCardVM(
      dto({ coaches: [{ id: "co1", nombre: "Marisa" }, { id: "co2", nombre: "Paty" }] }),
      "18:15",
    );
    expect(vm.coaches).toBe("Marisa, Paty");
    expect(vm.coachIds).toEqual(["co1", "co2"]);
  });

  it("renders 'Por asignar' when a session has no coaches", () => {
    expect(toCardVM(dto({ coaches: [] }), "18:15").coaches).toBe("Por asignar");
  });

  it("drives the card ★ from muestraEspecial (not raw esEspecial) but keeps esEspecial for the sheet/editor", () => {
    const vm = toCardVM(
      dto({ esEspecial: true, muestraEspecial: false, nombreEspecial: "Noche de Fuerza", estado: "a_continuacion" }),
      "18:15",
    );
    expect(vm.isSpecial).toBe(false); // suppressed while a_continuacion
    expect(vm.esEspecial).toBe(true);
    expect(vm.specialName).toBe("Noche de Fuerza");
  });

  it("carries the passed hora + booked/cap/mins/tipo through for both card and week-row rendering", () => {
    const vm = toCardVM(dto({ activos: 18, capacidad: 20, duracionMin: 60, tipo: "Metcon" }), "12:30");
    expect(vm).toMatchObject({ id: "s1", time: "12:30", mins: 60, tipo: "Metcon", booked: 18, cap: 20 });
  });

  it("carries the ABSOLUTE start as ISO — the tense predicate can't read the tz-folded hora (#238)", () => {
    expect(toCardVM(dto(), "08:00").startsAtIso).toBe("2026-06-17T14:00:00.000Z");
  });
});

/**
 * The tap-time branch (#238): which of the two write paths the operator's pick fires. The rule
 * itself is the domain predicate; this is the wiring in front of it — a correct rule routed to
 * the wrong callback is exactly what this catches. `ahora` is passed in because the caller
 * reads the clock INSIDE the tap handler, never at render.
 */
describe("accionAgregar", () => {
  const INICIO = "2026-06-17T14:00:00.000Z"; // window opens 12:30Z

  it("books while the arrival window is still shut — the phone call for tomorrow's class", () => {
    expect(accionAgregar(INICIO, new Date("2026-06-16T20:00:00.000Z"))).toBe("reservar");
    expect(accionAgregar(INICIO, new Date("2026-06-17T12:29:59.999Z"))).toBe("reservar");
  });

  it("checks in from the opening instant on — a member standing there an hour early is a visita", () => {
    expect(accionAgregar(INICIO, new Date("2026-06-17T12:30:00.000Z"))).toBe("pase");
    expect(accionAgregar(INICIO, new Date("2026-06-17T13:00:00.000Z"))).toBe("pase");
  });

  it("a tap AFTER the edge under a stale RESERVA label still checks in — never a false booking", () => {
    // The sheet was rendered at 12:29 (label: AGREGAR RESERVA) and tapped at 12:31.
    expect(accionAgregar(INICIO, new Date("2026-06-17T12:31:00.000Z"))).toBe("pase");
  });

  it("stays on the check-in side past the window's close — the branch never wraps back", () => {
    expect(accionAgregar(INICIO, new Date("2026-06-18T09:00:00.000Z"))).toBe("pase");
  });
});
