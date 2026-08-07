import { describe, expect, it } from "vitest";

import {
  WEEKDAY_TOGGLES,
  alcanceCaption,
  alcanceToggles,
  cancelConfirm,
  cancelLabel,
  cupoAviso,
  editorTitle,
  especialNombre,
  puedeAmpliarAlcance,
  saveLabel,
} from "./editor-sheet";

describe("editor copy", () => {
  it("titles and labels the create flow", () => {
    expect(editorTitle(false)).toBe("Nueva clase");
    expect(saveLabel(false)).toBe("Crear clase");
  });
  it("titles and labels the edit flow", () => {
    expect(editorTitle(true)).toBe("Editar clase");
    expect(saveLabel(true)).toBe("Guardar cambios");
  });
});

describe("WEEKDAY_TOGGLES", () => {
  it("is the six Lun–Sáb toggle labels", () => {
    expect(WEEKDAY_TOGGLES).toEqual(["L", "M", "Mi", "J", "V", "S"]);
  });
});

describe("especialNombre", () => {
  it("trims a provided name", () => {
    expect(especialNombre("  Noche de Fuerza  ")).toBe("Noche de Fuerza");
  });
  it("falls back to 'Especial' when blank", () => {
    expect(especialNombre("   ")).toBe("Especial");
    expect(especialNombre("")).toBe("Especial");
  });
});

/**
 * The one gate behind the wide scope (#243, defect D5): the toggle row, the effective `alcance`,
 * and the destructive button's wide arm all read this SAME value, so an unknown weekday can't
 * surface a wide option through one path while another correctly stays narrow. `cardDia`
 * undefined means UNKNOWN, never Lunes — fail CLOSED, never lie about which day gets touched.
 */
describe("puedeAmpliarAlcance", () => {
  it("allows a wide scope only when editing an attached card with a known weekday", () => {
    expect(puedeAmpliarAlcance(true, true, 3)).toBe(true);
  });
  it("refuses while creating — the scope toggle is an edit-only affordance", () => {
    expect(puedeAmpliarAlcance(false, true, 3)).toBe(false);
  });
  it("refuses for a one-off card (no rule behind it, esSerie false)", () => {
    expect(puedeAmpliarAlcance(true, false, 3)).toBe(false);
  });
  it("fails CLOSED when cardDia is unknown (D5) — never defaults to Lunes", () => {
    expect(puedeAmpliarAlcance(true, true, undefined)).toBe(false);
  });
});

/**
 * The #243 scope control. ONE toggle governs both the save path and the destructive one, so
 * these pure functions are the whole affordance: what the operator picks from, what each arm
 * promises, what the destructive button says, and what it must make them confirm first.
 */
describe("alcanceToggles", () => {
  it("offers narrow + this weekday when the group has only one active day", () => {
    expect(alcanceToggles(3, [3])).toEqual([
      { value: "clase", label: "Solo esta clase" },
      { value: "dia", label: "Todos los jueves" },
    ]);
  });
  it("names the CARD's own weekday, not the group's first one", () => {
    expect(alcanceToggles(0, [0, 2, 5])).toEqual([
      { value: "clase", label: "Solo esta clase" },
      { value: "dia", label: "Todos los lunes" },
      { value: "horario", label: "Todo el horario" },
    ]);
  });
  it("adds 'horario' only once the group spans more than one weekday", () => {
    expect(alcanceToggles(3, [3]).map((o) => o.value)).not.toContain("horario");
    expect(alcanceToggles(3, [1, 3]).map((o) => o.value)).toContain("horario");
  });
  it("never renders 'Todos undefined' for a domingo card (D6) — the DIAS_PLURAL lookup is total", () => {
    expect(alcanceToggles(6, [6]).find((o) => o.value === "dia")?.label).toBe("Todos los domingos");
  });
});

describe("alcanceCaption", () => {
  it("names the card's own weekday for 'dia', never a generic 'este horario'", () => {
    expect(alcanceCaption("dia", false, 3)).toBe(
      "Cambia las clases futuras de los jueves de este horario. Las pasadas no se tocan. Las reservas se mueven con la clase.",
    );
  });
  it("never promises to move a class that already started — the sheet opens on those too", () => {
    expect(alcanceCaption("dia", true, 3)).toBe(
      "Cambia las clases futuras de los jueves de este horario. Esta ya pasó y se queda como está. Las reservas se mueven con la clase.",
    );
  });
  it("claims every weekday for 'horario', never just the clicked card's day", () => {
    expect(alcanceCaption("horario", false, 3)).toBe(
      "Cambia las clases futuras de todos los días de este horario. Las pasadas no se tocan. Las reservas se mueven con la clase.",
    );
    expect(alcanceCaption("horario", true, 3)).toBe(
      "Cambia las clases futuras de todos los días de este horario. Esta ya pasó y se queda como está. Las reservas se mueven con la clase.",
    );
  });
  it("warns that the narrow scope DETACHES the class from its schedule — the silent `Única`", () => {
    expect(alcanceCaption("clase", false, 3)).toBe(
      "Esta clase se separa del horario. Los cambios del horario ya no la alcanzan.",
    );
    expect(alcanceCaption("clase", true, 3)).toBe(alcanceCaption("clase", false, 3));
  });
});

describe("cancelLabel", () => {
  it("names the card's own weekday when the scope is 'dia'", () => {
    expect(cancelLabel("dia", 3)).toBe("Terminar los jueves");
  });
  it("names the whole schedule when the scope is 'horario'", () => {
    expect(cancelLabel("horario", 3)).toBe("Terminar todo el horario");
  });
  it("stays the single-class cancel when the scope is narrow", () => {
    expect(cancelLabel("clase", 3)).toBe("Cancelar esta clase");
  });
  it("never says 'Terminar undefined' for a domingo card (D6)", () => {
    expect(cancelLabel("dia", 6)).toBe("Terminar los domingos");
  });
});

describe("cancelConfirm", () => {
  it("gates 'dia' — naming the day, not a generic 'el horario'", () => {
    expect(cancelConfirm("dia", 3)).toBe(
      "Se cancelarán todas las clases futuras de los jueves de este horario y se devolverán las clases reservadas. No se puede deshacer.",
    );
  });
  it("gates 'horario' — every day of the group, not just the clicked card's", () => {
    expect(cancelConfirm("horario", 3)).toBe(
      "Se cancelarán todas las clases futuras de este horario en todos sus días y se devolverán las clases reservadas. No se puede deshacer.",
    );
  });
  it("lets a single-class cancel through ungated, exactly as it shipped", () => {
    expect(cancelConfirm("clase", 3)).toBeNull();
  });
});

/**
 * Cupo below the current bookings WARNS (#243 §7). Refusing would trap an operator
 * whose one booking is six weeks out, so the only job here is to say it out loud —
 * and to say nothing at all while the cupo still fits.
 */
describe("cupoAviso", () => {
  it("warns when the new cupo is under what is already booked", () => {
    expect(cupoAviso(4, 9, "clase", 24)).toBe("Cupo por debajo de las 9 reservas · nadie pierde su lugar");
  });
  it("stays silent at exactly full — a cupo equal to the bookings is legal", () => {
    expect(cupoAviso(9, 9, "clase", 24)).toBeNull();
  });
  it("stays silent with room to spare, and on an empty class", () => {
    expect(cupoAviso(24, 9, "clase", 24)).toBeNull();
    expect(cupoAviso(24, 0, "clase", 24)).toBeNull();
  });

  // Both wide arms measure the SHRINK against the rule, not the clicked class's bookings —
  // the clicked class is one of dozens and its count says nothing about the others'.
  it.each(["dia", "horario"] as const)("warns on any shrink below the rule's cupo under '%s', whatever THIS class holds", (alcance) => {
    expect(cupoAviso(20, 0, alcance, 24)).toBe("El nuevo cupo aplica a todas las clases futuras · nadie pierde su lugar");
    expect(cupoAviso(4, 9, alcance, 24)).toBe("El nuevo cupo aplica a todas las clases futuras · nadie pierde su lugar");
  });
  it.each(["dia", "horario"] as const)("stays silent under '%s' when the rule's cupo holds or grows", (alcance) => {
    expect(cupoAviso(24, 9, alcance, 24)).toBeNull();
    expect(cupoAviso(30, 9, alcance, 24)).toBeNull();
  });
  it("never quotes the clicked class's booking count under a wide scope", () => {
    expect(cupoAviso(4, 9, "dia", 24)).not.toContain("9");
    expect(cupoAviso(4, 9, "horario", 24)).not.toContain("9");
  });
});
