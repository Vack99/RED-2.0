import { describe, expect, it } from "vitest";

import type { RosterRow } from "@gym/ui/forge/agenda/session-roster";

import { marcarPresente } from "./marcar-presente";

/**
 * `marcarPresente`'s own row-level behavior: which row moves, which don't, and the
 * `noAsistio` clear — covered here directly since `runPaseOptimista` (agenda.tsx) has no
 * test surface of its own.
 */

function row(over: Partial<RosterRow> = {}): RosterRow {
  return {
    clienteId: "c1",
    nombre: "Marisa Rangel",
    inicial: "MR",
    paquete: "Ilimitado",
    present: false,
    isWalkIn: false,
    noAsistio: false,
    ...over,
  };
}

describe("marcarPresente", () => {
  it("flips only the matching row's present", () => {
    const roster = [row({ clienteId: "c1", present: false }), row({ clienteId: "c2", present: false })];
    const next = marcarPresente(roster, "c1", true);
    expect(next[0].present).toBe(true);
    expect(next[1].present).toBe(false);
  });

  it("leaves every other row untouched — same object reference", () => {
    const other = row({ clienteId: "c2" });
    const roster = [row({ clienteId: "c1" }), other];
    const next = marcarPresente(roster, "c1", true);
    expect(next[1]).toBe(other);
  });

  it("is a no-op for a clienteId not on the roster", () => {
    const roster = [row({ clienteId: "c1" }), row({ clienteId: "c2" })];
    const next = marcarPresente(roster, "unknown", true);
    expect(next).toEqual(roster);
  });

  it("clears noAsistio when marking present — an asistida row is never 'no asistió'", () => {
    const roster = [row({ clienteId: "c1", present: false, noAsistio: true })];
    expect(marcarPresente(roster, "c1", true)[0].noAsistio).toBe(false);
  });

  it("leaves noAsistio as-is when un-marking present", () => {
    const roster = [row({ clienteId: "c1", present: true, noAsistio: false })];
    expect(marcarPresente(roster, "c1", false)[0].noAsistio).toBe(false);
  });
});
