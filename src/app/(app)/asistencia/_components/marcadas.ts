/**
 * Pure state for the attendance screen's per-day presence map: an ISO day →
 * the ids of clients marked present that day.
 *
 * `setMarcada` is the single transition used BOTH for the optimistic flip on
 * tap and for the reconcile against the server result, so an immediate flip and
 * a later confirmation of the same outcome converge to the identical set. It is
 * immutable (never touches the input) and idempotent (adding a present id or
 * removing an absent one is a no-op), which is what makes a double-tap in the
 * in-flight window safe.
 */
export type Marcadas = Record<string, string[]>;

/** Return a new map with `id` present (or absent) for `iso`, leaving the input untouched. */
export function setMarcada(marcadas: Marcadas, iso: string, id: string, present: boolean): Marcadas {
  const cur = new Set(marcadas[iso] ?? []);
  if (present) cur.add(id);
  else cur.delete(id);
  return { ...marcadas, [iso]: [...cur] };
}
