import "server-only";

import { createClient, type SupabaseServer } from "@/lib/supabase/server";

/**
 * Prev/next neighbors for the ficha's swipe navigation.
 *
 * **Contract:** neighbors follow ONE stable order — the browse-all roster order
 * (`nombre`). This is DELIBERATELY independent of the roster screen's transient
 * sort/filter: a swipe from any ficha always walks the same canonical sequence,
 * so the operator never lands "outside" their current view's mental model in an
 * unpredictable way. The order is the seam's swap point — a future
 * "match the operator's filtered view" variant slots in behind this same
 * `getVecinos` interface (pass a different ordered id source) without touching
 * callers. We do NOT chase per-view consistency now (chosen resolution).
 *
 * The math (`vecinosDe`) is pure and unit-tested with no client; the I/O wrapper
 * (`getVecinos`) only supplies the ordered ids via the injectable DAL client.
 */
export interface Vecinos {
  prevId: string | null;
  nextId: string | null;
}

/**
 * Pure neighbor math: given the ordered id array and a target, return the
 * adjacent ids. First → prev null; last → next null; not-found or empty → both
 * null. The deep, tested core — no I/O.
 */
export function vecinosDe(orderedIds: string[], targetId: string): Vecinos {
  const idx = orderedIds.indexOf(targetId);
  return {
    prevId: idx > 0 ? orderedIds[idx - 1] : null,
    nextId: idx >= 0 && idx < orderedIds.length - 1 ? orderedIds[idx + 1] : null,
  };
}

/**
 * The ficha's swipe neighbors for `targetId`, in the stable browse-all name
 * order. Fetches the ordered id roster (the I/O part) and defers to `vecinosDe`.
 */
export async function getVecinos(targetId: string, client?: SupabaseServer): Promise<Vecinos> {
  const supabase = client ?? (await createClient());
  const { data } = await supabase.from("clientes").select("id").order("nombre");
  return vecinosDe((data ?? []).map((x) => x.id), targetId);
}
