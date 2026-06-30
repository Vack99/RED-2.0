// ──────────────────────────────────────────────────────────────
// Pure calendar helpers (es-MX labels + local-component date math).
// All functions here are pure: they read/produce a Date's LOCAL Y/M/D,
// never the wall clock. The DEMO_TODAY offset scaffolding was retired in
// the cleanup slice; "today" now comes from fecha.ts (Chihuahua tz).
// ──────────────────────────────────────────────────────────────

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

/** "MIÉ · 27 MAY 2026" — the dashboard greeting eyebrow (carries the year). */
export function fmtEyebrow(d: Date): string {
  return `${DOW[d.getDay()]} · ${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`;
}

/** "MAYO 2026" — the cuenta "resumen del mes" header. */
export function fmtMesAnio(d: Date): string {
  return `${MONTHS_FULL[d.getMonth()]} ${d.getFullYear()}`.toUpperCase();
}
