import type { CardVM } from "./session-vm";

/**
 * The card the quick-glance sheet actually renders. `glance.card` (agenda.tsx) is a
 * SNAPSHOT taken at `openGlance` — it never changes again on its own. Every roster
 * write (`runRoster`: book, cancel, pasar lista) reloads the roster AND calls
 * `router.refresh()`, which lands a fresh `booked` on the week's `dias[].cards` — but
 * not on the snapshot, so LISTA gained a name while the header's CUPO/"lugares
 * libres" stayed frozen at open-time until the sheet was closed and reopened.
 *
 * This walks the CURRENT week's cards for the same id and returns that one instead —
 * a plain lookup, no state of its own. `glance.card` stays the sheet's identity/
 * open-state source (its `id` is what we search for); only the rendered VALUES swap
 * to the fresher card. Falls back to the snapshot when the id is no longer in the
 * loaded week — week navigation, or the class was deleted — since there is nothing
 * fresher to show.
 */
export function cardVigente(dias: { cards: CardVM[] }[], card: CardVM): CardVM {
  for (const dia of dias) {
    const fresh = dia.cards.find((c) => c.id === card.id);
    if (fresh) return fresh;
  }
  return card;
}
