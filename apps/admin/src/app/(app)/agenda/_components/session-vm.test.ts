import { describe, expect, it } from "vitest";

import type { SesionAgendaDTO } from "@gym/data/server/agenda";

import {
  accionAgregar,
  canceladasLinea,
  coachIdsCambiaron,
  createDraft,
  editDraftFrom,
  esBloqueoVendible,
  movidasLinea,
  sugerenciaVenta,
  toCardVM,
} from "./session-vm";

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
    templateId: null,
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

  it("carries the generating rule through — null is a one-off, an id is a series (#243)", () => {
    expect(toCardVM(dto(), "08:00").templateId).toBeNull();
    expect(toCardVM(dto({ templateId: "tpl-1" }), "08:00").templateId).toBe("tpl-1");
  });
});

/**
 * The editor's draft seeds. The load-bearing field is `alcance`: it is re-seeded on
 * EVERY open, so "esta y las siguientes" can never be left armed for the next card
 * the operator taps — a sticky wide scope would silently rewrite a whole schedule.
 */
describe("createDraft", () => {
  it("seeds the PRD defaults with the first tipo and no repeat days", () => {
    expect(createDraft("Fuerza")).toEqual({
      tipo: "Fuerza",
      hora: "18:00",
      duracionMin: 45,
      cupo: 24,
      coachIds: [],
      repeatDays: [false, false, false, false, false, false],
      alcance: "clase",
      isSpecial: false,
      specialName: "",
    });
  });
  it("tolerates an empty tipo catalog", () => {
    expect(createDraft("").tipo).toBe("");
  });
});

describe("editDraftFrom", () => {
  const card = toCardVM(
    dto({
      templateId: "tpl-1",
      duracionMin: 60,
      capacidad: 30,
      tipo: "Metcon",
      esEspecial: true,
      nombreEspecial: "Noche de Fuerza",
      coaches: [{ id: "co1", nombre: "Marisa" }],
    }),
    "19:00",
  );

  it("seeds the sheet from the clicked session", () => {
    expect(editDraftFrom(card)).toMatchObject({
      tipo: "Metcon",
      hora: "19:00",
      duracionMin: 60,
      cupo: 30,
      coachIds: ["co1"],
      isSpecial: true,
      specialName: "Noche de Fuerza",
    });
  });

  it("defaults the scope to this class alone, even for a session that came from a rule", () => {
    expect(editDraftFrom(card).alcance).toBe("clase");
  });

  it("RE-seeds the scope on every open — a wide edit never survives into the next card", () => {
    const tocado = { ...editDraftFrom(card), alcance: "serie" as const };
    expect(tocado.alcance).toBe("serie");
    expect(editDraftFrom(card).alcance).toBe("clase");
  });

  it("leaves the weekday row empty — it is the create flow's alone", () => {
    expect(editDraftFrom(card).repeatDays).toEqual([false, false, false, false, false, false]);
  });

  it("blanks a missing special name rather than carrying null into the input", () => {
    expect(editDraftFrom(toCardVM(dto(), "19:00")).specialName).toBe("");
  });
});

/**
 * Whether a series write sends its coach set at all (#243). The sheet seeds coaches
 * from the ONE clicked session, so sending them unconditionally would stamp last
 * week's substitute onto the whole schedule; the RPC leaves them alone when omitted.
 */
describe("coachIdsCambiaron", () => {
  it("is false when the operator never touched the multi-select", () => {
    expect(coachIdsCambiaron(["co1", "co2"], ["co1", "co2"])).toBe(false);
    expect(coachIdsCambiaron([], [])).toBe(false);
  });
  it("ignores order — the multi-select appends taps, a re-tapped-back set is unchanged", () => {
    expect(coachIdsCambiaron(["co1", "co2"], ["co2", "co1"])).toBe(false);
  });
  it("is true on an added, a removed, or a swapped coach", () => {
    expect(coachIdsCambiaron(["co1"], ["co1", "co2"])).toBe(true);
    expect(coachIdsCambiaron(["co1", "co2"], ["co1"])).toBe(true);
    expect(coachIdsCambiaron(["co1"], ["co2"])).toBe(true);
  });
  it("is true when the operator clears every coach", () => {
    expect(coachIdsCambiaron(["co1"], [])).toBe(true);
  });
});

/**
 * The two series receipts. Both RPCs return an int, and the count is the only honest
 * thing to show: a move can legitimately report fewer classes than the horizon holds
 * (one whose new time would land in the past is detached, not moved).
 */
describe("movidasLinea", () => {
  it("counts the future classes a series move actually rewrote", () => {
    expect(movidasLinea(6)).toBe("6 clases futuras movidas");
  });
  it("reads singular for one, and survives a zero-move (every week already past)", () => {
    expect(movidasLinea(1)).toBe("1 clase futura movida");
    expect(movidasLinea(0)).toBe("0 clases futuras movidas");
  });
});

describe("canceladasLinea", () => {
  it("counts the cancelled classes and says the held ones came back", () => {
    expect(canceladasLinea(6)).toBe("6 clases canceladas · clases devueltas");
    expect(canceladasLinea(1)).toBe("1 clase cancelada · clases devueltas");
    expect(canceladasLinea(0)).toBe("0 clases canceladas · clases devueltas");
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

/**
 * Which refusals a SALE fixes (#235 story 10). The strings are our own `raise exception` literals,
 * so exact match is the contract — and the negative cases are what matter: offering VENDER on a
 * full class or a duplicate booking sends the operator to charge a member for nothing.
 */
describe("esBloqueoVendible", () => {
  it("catches both sellable walls — an empty balance and a lapsed vigencia", () => {
    expect(esBloqueoVendible("Sin clases disponibles")).toBe(true);
    expect(esBloqueoVendible("Paquete vencido")).toBe(true);
  });

  it.each([
    "Clase llena",
    "Ya reservaste esta clase",
    "La clase ya comenzó",
    "No autorizado",
    "Cliente no encontrado",
  ])("refuses '%s' — no paquete on earth changes that fact", (error) => {
    expect(esBloqueoVendible(error)).toBe(false);
  });

  it("is exact, never fuzzy: an empty string and a near-miss are both no", () => {
    expect(esBloqueoVendible("")).toBe(false);
    expect(esBloqueoVendible("paquete vencido")).toBe(false);
  });
});

/**
 * The blocked pick's bridge (#235 story 10) — and this IS the line's visibility: `null` renders
 * nothing. Both halves must hold, because each failure mode is its own bug: a non-sellable refusal
 * would sell against a full class, and an unnamed member would offer an anonymous VENDER.
 */
describe("sugerenciaVenta", () => {
  const MARISA = { id: "c1", nombre: "Marisa Rangel" };

  it("names the blocked member and deep-links the sale that unblocks them (#77)", () => {
    expect(sugerenciaVenta("Sin clases disponibles", MARISA)).toEqual({
      nombre: "Marisa Rangel",
      href: "/vender?cliente=c1",
    });
  });

  it("bridges an expired package the same way — one wall, one answer", () => {
    expect(sugerenciaVenta("Paquete vencido", MARISA)?.href).toBe("/vender?cliente=c1");
  });

  it("stays silent on a refusal a sale cannot fix", () => {
    expect(sugerenciaVenta("Clase llena", MARISA)).toBeNull();
  });

  it("stays silent when the picker can no longer name the member", () => {
    expect(sugerenciaVenta("Paquete vencido", undefined)).toBeNull();
  });
});
