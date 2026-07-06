import { describe, expect, it } from "vitest";

import { WEEKDAY_TOGGLES, editorTitle, especialNombre, saveLabel } from "./editor-sheet";

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
