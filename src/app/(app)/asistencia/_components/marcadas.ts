/**
 * Pure state for the attendance screen's per-day presence map: an ISO day →
 * the ids of clients marked present that day.
 *
 * `setMarcada` is the single transition used BOTH for the optimistic flip on
 * tap and for the reconcile against the server result. It is immutable (never
 * touches the input) and idempotent (adding a present id or removing an absent
 * one is a no-op), so the optimistic flip and the later server reconcile of the
 * same outcome converge to the identical set. Note this is NOT what makes a
 * double-tap safe: a second tap in the in-flight window would compute the
 * opposite direction and fire a competing toggle — the `inFlight` guard in
 * asistencia.tsx (not idempotency) is what blocks that. The two are
 * complementary: the guard prevents the competing action, idempotency keeps the
 * single in-flight action's optimistic and reconciled states consistent.
 */
export type Marcadas = Record<string, string[]>;

/** Return a new map with `id` present (or absent) for `iso`, leaving the input untouched. */
export function setMarcada(marcadas: Marcadas, iso: string, id: string, present: boolean): Marcadas {
  const cur = new Set(marcadas[iso] ?? []);
  if (present) cur.add(id);
  else cur.delete(id);
  return { ...marcadas, [iso]: [...cur] };
}
