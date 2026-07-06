import { describe, expect, it } from "vitest";

import {
  ALL_ESTADOS,
  CUPO_OPTIONS,
  DATE_STRIP_DAYS,
  DURACION_OPTIONS,
  HORA_OPTIONS,
  SESSION_CARD_FIXTURES,
  WEEK_ROWS_EMPTY,
} from "./fixtures";
import type { EstadoSesion } from "./session-view";

/**
 * The acceptance criteria require every primitive to render every state from
 * fixtures. This guards that the fixtures actually enumerate them — all five
 * card states (the four estados + the "A continuación" next accent), a special ★
 * with a multi-coach string, and an empty day — so the fresh-eyes visual gate
 * has a complete state matrix to mount.
 */
describe("session card fixtures", () => {
  it("covers all four occupancy estados", () => {
    const estados = new Set<EstadoSesion>(Object.values(SESSION_CARD_FIXTURES).map((c) => c.estado));
    for (const e of ALL_ESTADOS) expect(estados.has(e)).toBe(true);
  });
  it("includes the next-upcoming (A continuación) accent", () => {
    expect(Object.values(SESSION_CARD_FIXTURES).some((c) => c.isNext)).toBe(true);
  });
  it("includes a special ★ session with a multi-coach string", () => {
    const special = Object.values(SESSION_CARD_FIXTURES).find((c) => c.isSpecial);
    expect(special?.specialName).toBeTruthy();
    expect(special?.coaches).toContain(", ");
  });
});

describe("week + editor fixtures", () => {
  it("provides an empty day", () => {
    expect(WEEK_ROWS_EMPTY).toHaveLength(0);
  });
  it("provides the six Lun–Sáb strip days", () => {
    expect(DATE_STRIP_DAYS).toHaveLength(6);
    expect(DATE_STRIP_DAYS[0].wd).toBe("Lun");
    expect(DATE_STRIP_DAYS[5].wd).toBe("Sáb");
  });
  it("bounds the editor pickers per data-model §4", () => {
    expect(HORA_OPTIONS[0]).toBe("05:00");
    expect(HORA_OPTIONS[HORA_OPTIONS.length - 1]).toBe("22:45");
    expect(DURACION_OPTIONS).toEqual([30, 45, 60, 75, 90]);
    expect(CUPO_OPTIONS[0]).toBe(4);
    expect(CUPO_OPTIONS[CUPO_OPTIONS.length - 1]).toBe(40);
  });
});
