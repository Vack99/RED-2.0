/**
 * `?sesion=<id>` (#328) — the /inicio hero/peek deep link — resolves to the CALENDAR
 * DAY that session lives on, within the currently loaded week ONLY: a stale or
 * foreign-week id (the week rolled over, the class was cancelled) is ignored rather
 * than guessed at, so the page falls back to its ordinary `?d=`/today default and the
 * client never tries to open a sheet for a card that isn't there.
 */

export interface DiaSesiones {
  iso: string;
  ids: string[];
}

export function resolverDiaSesion(dias: DiaSesiones[], sesionId: string | undefined): string | null {
  if (!sesionId) return null;
  return dias.find((dia) => dia.ids.includes(sesionId))?.iso ?? null;
}
