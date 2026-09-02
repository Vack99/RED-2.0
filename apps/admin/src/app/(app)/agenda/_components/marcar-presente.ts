import type { RosterRow } from "@gym/ui/forge/agenda/session-roster";

/**
 * Flips one roster row's `present` in place. `runPaseOptimista` (agenda.tsx) uses it three
 * ways: to apply the LISTA checkbox's tap immediately, to reconcile once the RPC resolves —
 * only `present` is read off its `{ present, hora }` result, `hora` has no home on `RosterRow`
 * and stays unused — and, on failure or a thrown error, to revert.
 *
 * `noAsistio` is DERIVED server-side (`esNoAsistio`, `@gym/domain/rules`) from status + the
 * arrival window, never stored, and this patch only knows the one fact it's handed — so it
 * clears `noAsistio` when marking present (an "asistida" row is never "no asistió", the same
 * rule the server derives it from) and otherwise leaves it as the last real read left it; the
 * next full roster load corrects it if it ever drifts.
 */
export function marcarPresente(roster: RosterRow[], clienteId: string, present: boolean): RosterRow[] {
  return roster.map((row) =>
    row.clienteId === clienteId ? { ...row, present, noAsistio: present ? false : row.noAsistio } : row,
  );
}
