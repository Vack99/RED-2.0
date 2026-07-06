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

// ── Agenda formatting (Phase 5, ADR-0010) — tz-parameterized only via the
//    caller's already-zoned Date; these functions never read a gym row. ──

/** Whole-day signed distance from `a` to `b` at local-midnight granularity
 *  (mirrors @gym/domain's private helper of the same shape — the two packages
 *  are siblings, not layered, so this small duplication is the honest cost of
 *  the dependency-cruiser boundary, not an oversight). */
function difDias(a: Date, b: Date): number {
  return Math.round((startOfDay(b).getTime() - startOfDay(a).getTime()) / 86_400_000);
}

/** "MIÉ 17 JUN" — the Agenda day heading (no year; distinct from fmtEyebrow's
 *  dashboard "MIÉ · 27 MAY 2026"). */
export function fmtDiaAgenda(d: Date): string {
  return `${DOW[d.getDay()]} ${d.getDate()} ${MON[d.getMonth()]}`;
}

/** "N clase(s)", singularizing "1 clase" — the shared noun both agenda
 *  summary formats need. */
function nClases(n: number): string {
  return n === 1 ? "1 clase" : `${n} clases`;
}

/** DÍA header: "N clases · M reservas" (mock: "6 clases · 109 reservas"). */
export function fmtResumenDia(clases: number, reservas: number): string {
  return `${nClases(clases)} · ${reservas} reservas`;
}

/** SEMANA day-group header: "N clases · X%" occupancy. */
export function fmtResumenDiaSemana(clases: number, ratioOcupacion: number): string {
  return `${nClases(clases)} · ${Math.round(ratioOcupacion * 100)}%`;
}

/** SEMANA week footer: "Semana · X% ocupación". */
export function fmtResumenSemana(ratioOcupacion: number): string {
  return `Semana · ${Math.round(ratioOcupacion * 100)}% ocupación`;
}

/** DÍA navigator relative label: Hoy / Mañana / Ayer / "En N días" / "Hace N días". */
export function fmtNavegadorDia(dia: Date, hoy: Date): string {
  const offset = difDias(hoy, dia);
  if (offset === 0) return "Hoy";
  if (offset === 1) return "Mañana";
  if (offset === -1) return "Ayer";
  if (offset > 1) return `En ${offset} días`;
  return `Hace ${-offset} días`;
}

/** SEMANA navigator relative label: Esta semana / Próxima semana / Semana
 *  anterior / "En N semanas" / "Hace N semanas". Both args are each week's
 *  MONDAY (local calendar date) — the caller resolves which week a date
 *  falls in (inicioSemana); this only compares week starts. */
export function fmtNavegadorSemana(lunesSemana: Date, lunesHoy: Date): string {
  const offset = Math.round(difDias(lunesHoy, lunesSemana) / 7);
  if (offset === 0) return "Esta semana";
  if (offset === 1) return "Próxima semana";
  if (offset === -1) return "Semana anterior";
  if (offset > 1) return `En ${offset} semanas`;
  return `Hace ${-offset} semanas`;
}

/** Monday (local calendar date) of the Lun–Sáb week containing `d`. JS's
 *  getDay() is Sunday-first (0=Dom); this app's week is Lun-Sáb with no
 *  Domingo class day, so a Domingo date belongs to the FOLLOWING week's
 *  Monday (there is no "Domingo" row to anchor it to instead). */
export function inicioSemana(d: Date): Date {
  const dow = d.getDay(); // 0=Dom..6=Sáb
  const diasDesdeLunes = dow === 0 ? 1 : 1 - dow;
  return addDays(d, diasDesdeLunes);
}

/** The six local calendar dates Lun..Sáb of the week containing `d` — the
 *  Agenda's date strip. */
export function semanaLunSab(d: Date): Date[] {
  const lunes = inicioSemana(d);
  return Array.from({ length: 6 }, (_, i) => addDays(lunes, i));
}

/** ±1 day step for the DÍA navigator arrows — wraps Sáb→Lun (next week) and
 *  Lun→Sáb (prior week), since Domingo is never a day the Agenda shows. */
export function pasoDia(d: Date, delta: 1 | -1): Date {
  const dow = d.getDay();
  if (delta === 1) return dow === 6 ? addDays(d, 2) : addDays(d, 1); // Sáb -> skip Dom -> Lun
  return dow === 1 ? addDays(d, -2) : addDays(d, -1); // Lun -> skip Dom -> Sáb (prior week)
}
