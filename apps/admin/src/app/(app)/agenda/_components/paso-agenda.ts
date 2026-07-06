import { addDays, parseDay, pasoDia, toIsoDay } from "@gym/format";

/**
 * The navigator arrows' step decision, pure (the component is the DOM adapter —
 * lib/swipe.ts precedent). SEMANA: always a ±7-day `goto` — a URL navigation with
 * no view semantics, so the mounted orchestrator (rendered without a `key`) keeps
 * its DÍA/SEMANA toggle across week paging (PRD (f)). DÍA: an in-strip step is a
 * `select`; past either end it wraps across weeks via pasoDia.
 */

export type PasoAgenda = { kind: "select"; index: number } | { kind: "goto"; iso: string };

export function pasoAgenda(
  view: "dia" | "semana",
  selectedIndex: number,
  selectedIso: string,
  dir: 1 | -1,
): PasoAgenda {
  const selectedDate = parseDay(selectedIso);
  if (view === "semana") return { kind: "goto", iso: toIsoDay(addDays(selectedDate, dir * 7)) };
  const next = selectedIndex + dir;
  if (next >= 0 && next <= 5) return { kind: "select", index: next };
  return { kind: "goto", iso: toIsoDay(pasoDia(selectedDate, dir)) };
}
