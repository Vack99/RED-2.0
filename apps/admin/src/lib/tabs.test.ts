import { describe, expect, it } from "vitest";

import { tabsPara } from "./tabs";

describe("tabsPara", () => {
  it("Cupo: INICIO, CLIENTES, ASIST (primary), AGENDA, CUENTA", () => {
    expect(tabsPara("cupo").map((t) => t.label)).toEqual([
      "INICIO",
      "CLIENTES",
      "ASIST",
      "AGENDA",
      "CUENTA",
    ]);
    expect(tabsPara("cupo").find((t) => t.label === "AGENDA")?.href).toBe("/agenda");
  });

  it("Lista: INICIO, CLIENTES, ASIST (primary), VENDER, CUENTA — AGENDA swapped for VENDER", () => {
    expect(tabsPara("lista").map((t) => t.label)).toEqual([
      "INICIO",
      "CLIENTES",
      "ASIST",
      "VENDER",
      "CUENTA",
    ]);
    expect(tabsPara("lista").find((t) => t.label === "VENDER")?.href).toBe("/vender");
    expect(tabsPara("lista").some((t) => t.label === "AGENDA")).toBe(false);
  });

  it("ASIST is primary and in the same slot in both modes", () => {
    for (const modo of ["cupo", "lista"] as const) {
      const tabs = tabsPara(modo);
      expect(tabs[2]).toMatchObject({ label: "ASIST", primary: true });
    }
  });
});
