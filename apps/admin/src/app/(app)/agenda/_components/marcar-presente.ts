import type { RosterRow } from "@gym/ui/forge/agenda/session-roster";

/**
 * The LISTA present-toggle's optimistic patch (owner report: the check mark "takes time" to
 * move). `runPase` (agenda.tsx) used to await the RPC, then await a SECOND full roster refetch
 * before the row flipped — two serial Vercel→Supabase trips before the tap did anything visible.
 * This flips ONE row's `present` in place, so the tap moves the check mark immediately;
 * `runPase` applies it optimistically, then reconciles from the RPC's own authoritative
 * `{ present, hora }` result once it resolves (or reverts the whole roster on failure).
 *
 * `noAsistio` is DERIVED server-side (`esNoAsistio`, `@gym/domain/rules`) from status + the
 * arrival window, never stored, and this patch only knows the one fact the RPC hands back —
 * so it clears `noAsistio` when marking present (an "asistida" row is never "no asistió", the
 * same rule the server derives it from) and otherwise leaves it as the last real read left it;
 * the next full roster load (sheet reopen, a walk-in add/cancel) corrects it if it ever drifts.
 */
export function marcarPresente(roster: RosterRow[], clienteId: string, present: boolean): RosterRow[] {
  return roster.map((row) =>
    row.clienteId === clienteId ? { ...row, present, noAsistio: present ? false : row.noAsistio } : row,
  );
}
