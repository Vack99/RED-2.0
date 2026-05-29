// ──────────────────────────────────────────────────────────────
// Demo calendar.
// The prototype pins "today" to Thu 27 May 2026 so the seeded data
// (vence dates, "hoy" markers, the attendance week) stays coherent.
// All date math in the app is relative to DEMO_TODAY, not the wall clock.
// ──────────────────────────────────────────────────────────────

export const DEMO_TODAY = new Date(2026, 4, 27); // months are 0-based → May

export const DOW = ["DOM", "LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"];
export const MON = [
  "ENE", "FEB", "MAR", "ABR", "MAY", "JUN",
  "JUL", "AGO", "SEP", "OCT", "NOV", "DIC",
];
export const WEEKDAYS_FULL = [
  "domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado",
];
export const MONTHS_FULL = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export function addDays(d: Date, n: number): Date {
  const r = startOfDay(d);
  r.setDate(r.getDate() + n);
  return r;
}

/** Whole-day signed offset from DEMO_TODAY (0 = today, -1 = yesterday). */
export function offsetFromToday(d: Date): number {
  const ms = startOfDay(d).getTime() - startOfDay(DEMO_TODAY).getTime();
  return Math.round(ms / 86_400_000);
}

export function dateFromOffset(n: number): Date {
  return addDays(DEMO_TODAY, n);
}

export function isoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function sameDay(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** "jueves 27 de mayo" */
export function fmtFull(d: Date): string {
  return `${WEEKDAYS_FULL[d.getDay()]} ${d.getDate()} de ${MONTHS_FULL[d.getMonth()]}`;
}

/** "27 may" */
export function fmtShort(d: Date): string {
  return `${d.getDate()} ${MON[d.getMonth()].toLowerCase()}`;
}
