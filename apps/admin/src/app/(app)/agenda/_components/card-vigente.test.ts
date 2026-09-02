import { describe, expect, it } from "vitest";

import { cardVigente } from "./card-vigente";
import type { CardVM } from "./session-vm";

/**
 * The quick-glance sheet's header source. `glance.card` is an open-time snapshot
 * that never updates on its own; every roster write refreshes the week's props
 * instead. This is the lookup that lets the sheet render the fresh card while
 * `glance.card` stays only the identity/open-state anchor.
 */

function card(over: Partial<CardVM> = {}): CardVM {
  return {
    id: "s1",
    time: "18:00",
    startsAtIso: "2026-06-17T18:00:00.000Z",
    mins: 45,
    tipo: "Funcional",
    coaches: "Marisa",
    coachIds: ["co1"],
    booked: 2,
    cap: 20,
    estado: "normal",
    isNext: false,
    isSpecial: false,
    esEspecial: false,
    specialName: null,
    templateId: null,
    plantilla: null,
    ...over,
  };
}

describe("cardVigente", () => {
  it("returns the same-id card from the current week's props, not the snapshot", () => {
    const snapshot = card({ booked: 2, cap: 20 });
    const fresh = card({ booked: 3, cap: 20 });
    const dias = [{ cards: [card({ id: "other" }), fresh] }];
    expect(cardVigente(dias, snapshot)).toBe(fresh);
  });

  it("falls back to the snapshot when its id is no longer in the loaded week", () => {
    const snapshot = card({ id: "gone" });
    const dias = [{ cards: [card({ id: "s1" })] }];
    expect(cardVigente(dias, snapshot)).toBe(snapshot);
  });

  it("falls back to the snapshot when dias is empty", () => {
    const snapshot = card();
    expect(cardVigente([], snapshot)).toBe(snapshot);
  });

  it("searches every day, not just the first", () => {
    const snapshot = card({ booked: 1 });
    const fresh = card({ booked: 5 });
    const dias = [{ cards: [] }, { cards: [card({ id: "other" })] }, { cards: [fresh] }];
    expect(cardVigente(dias, snapshot)).toBe(fresh);
  });
});
