import { describe, expect, it } from "vitest";

import {
  ALCANCE_TOGGLES,
  WEEKDAY_TOGGLES,
  alcanceCaption,
  cancelConfirm,
  cancelLabel,
  cupoAviso,
  editorTitle,
  especialNombre,
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
 * The #243 scope control. ONE toggle governs both the save path and the destructive
 * one, so these four pure functions are the whole affordance: what the operator picks
 * from, what the wide arm promises, what the destructive button says, and what it must
 * make them confirm first.
 */
describe("ALCANCE_TOGGLES", () => {
  it("offers exactly two scopes, narrow first", () => {
    expect(ALCANCE_TOGGLES).toEqual([
      { value: "clase", label: "Solo esta clase" },
      { value: "serie", label: "Esta y las siguientes" },
    ]);
  });
});

describe("alcanceCaption", () => {
  it("claims the SCHEDULE's future classes, never 'esta' — the clicked one may be the kept one", () => {
    expect(alcanceCaption("serie", false)).toBe(
      "Cambia las clases futuras de este horario. Las pasadas no se tocan. Las reservas se mueven con la clase.",
    );
  });
  it("never promises to move a class that already started — the sheet opens on those too", () => {
    expect(alcanceCaption("serie", true)).toBe(
      "Cambia las clases futuras de este horario. Esta ya pasó y se queda como está. Las reservas se mueven con la clase.",
    );
  });
  it("warns that the narrow scope DETACHES the class from its schedule — the silent `Única`", () => {
    expect(alcanceCaption("clase", false)).toBe(
      "Esta clase se separa del horario. Los cambios del horario ya no la alcanzan.",
    );
    expect(alcanceCaption("clase", true)).toBe(alcanceCaption("clase", false));
  });
});

describe("cancelLabel", () => {
  it("names the schedule, not the class, when the scope is wide", () => {
    expect(cancelLabel("serie")).toBe("Terminar el horario");
  });
  it("stays the single-class cancel when the scope is narrow", () => {
    expect(cancelLabel("clase")).toBe("Cancelar esta clase");
  });
});

describe("cancelConfirm", () => {
  it("gates the wide arm — six weeks of cancellations and refunds is not one tap", () => {
    expect(cancelConfirm("serie")).toBe(
      "Se cancelarán todas las clases futuras de este horario y se devolverán las clases reservadas. No se puede deshacer.",
    );
  });
  it("lets a single-class cancel through ungated, exactly as it shipped", () => {
    expect(cancelConfirm("clase")).toBeNull();
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

  // The wide arm measures the SHRINK against the rule, not the clicked class's bookings —
  // the clicked class is one of dozens and its count says nothing about the others'.
  it("warns on any shrink below the rule's cupo, whatever THIS class happens to hold", () => {
    expect(cupoAviso(20, 0, "serie", 24)).toBe("El nuevo cupo aplica a todas las clases futuras · nadie pierde su lugar");
    expect(cupoAviso(4, 9, "serie", 24)).toBe("El nuevo cupo aplica a todas las clases futuras · nadie pierde su lugar");
  });
  it("stays silent when the rule's cupo holds or grows", () => {
    expect(cupoAviso(24, 9, "serie", 24)).toBeNull();
    expect(cupoAviso(30, 9, "serie", 24)).toBeNull();
  });
  it("never quotes the clicked class's booking count under the wide scope", () => {
    expect(cupoAviso(4, 9, "serie", 24)).not.toContain("9");
  });
});
