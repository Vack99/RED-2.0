import { describe, expect, it } from "vitest";

import type { SesionAgendaDTO } from "@gym/data/server/agenda";

import { toCardVM } from "./session-vm";

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
});
