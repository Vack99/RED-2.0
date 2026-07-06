import { describe, expect, it } from "vitest";

import { pasoAgenda } from "./paso-agenda";

/**
 * The navigator arrows' step decision, pure (the component is just the adapter —
 * lib/swipe.ts precedent). What it pins, per PRD (f) + the Gate-1 re-plan:
 *
 * - SEMANA: a step is ALWAYS a ±7-day `goto` (URL navigation). It is never a
 *   `select` and carries no view semantics — combined with the page rendering the
 *   orchestrator WITHOUT a `key`, the mounted instance (and its `view` state)
 *   survives week paging: stepping weeks in SEMANA stays in SEMANA.
 * - DÍA: an in-strip step is a `select` (instant client state, no navigation);
 *   past either end it wraps across weeks via pasoDia (Sáb→Lun / Lun→Sáb).
 */

describe("pasoAgenda — SEMANA (arrows step ±1 week, view-preserving goto)", () => {
  it("steps forward exactly one week from the selected day", () => {
    expect(pasoAgenda("semana", 2, "2026-06-17", 1)).toEqual({ kind: "goto", iso: "2026-06-24" });
  });

  it("steps back exactly one week from the selected day", () => {
    expect(pasoAgenda("semana", 2, "2026-06-17", -1)).toEqual({ kind: "goto", iso: "2026-06-10" });
  });

  it("is a goto (never an in-strip select) even when the strip could absorb the step", () => {
    // Mid-strip index in SEMANA still navigates — the arrows page weeks, not days.
    expect(pasoAgenda("semana", 0, "2026-06-15", 1).kind).toBe("goto");
    expect(pasoAgenda("semana", 5, "2026-06-20", -1).kind).toBe("goto");
  });
});

describe("pasoAgenda — DÍA (arrows step ±1 day, wrapping across weeks)", () => {
  it("selects the neighboring strip day in-week (no navigation)", () => {
    expect(pasoAgenda("dia", 2, "2026-06-17", 1)).toEqual({ kind: "select", index: 3 });
    expect(pasoAgenda("dia", 2, "2026-06-17", -1)).toEqual({ kind: "select", index: 1 });
  });

  it("wraps Sáb → next week's Lun via navigation", () => {
    // Sáb 20 jun 2026, strip index 5 — stepping forward leaves the week.
    expect(pasoAgenda("dia", 5, "2026-06-20", 1)).toEqual({ kind: "goto", iso: "2026-06-22" });
  });

  it("wraps Lun → prior week's Sáb via navigation", () => {
    // Lun 15 jun 2026, strip index 0 — stepping back leaves the week.
    expect(pasoAgenda("dia", 0, "2026-06-15", -1)).toEqual({ kind: "goto", iso: "2026-06-13" });
  });
});
