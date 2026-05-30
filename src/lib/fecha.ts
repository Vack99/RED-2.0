// Real (non-mock) calendar helpers for the Supabase era. The domain rules
// (src/domain/rules.ts) read a Date's LOCAL components, so every Date handed to
// them must carry the Chihuahua calendar Y/M/D in its local fields. These helpers
// bridge the wall clock + Postgres `date` strings into that shape.
//
// Unlike src/lib/date.ts (DEMO_TODAY scaffolding, retired in the cleanup slice),
// this module is the keeper.

export const TZ = "America/Chihuahua";

/** Today in America/Chihuahua, as a Date whose local Y/M/D = the Chihuahua date. */
export function hoyChihuahua(): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return new Date(get("year"), get("month") - 1, get("day"));
}

/** Parse a Postgres `date` ("YYYY-MM-DD") into a local-midnight Date. */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Serialize a Date to a Postgres `date` literal ("YYYY-MM-DD") using local fields. */
export function toIsoDay(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Today's iso day in America/Chihuahua ("YYYY-MM-DD"). */
export function hoyIsoChihuahua(): string {
  return toIsoDay(hoyChihuahua());
}

/** The Chihuahua-local calendar Date for a timestamptz string (handles tz drift). */
export function fechaChihuahua(isoTimestamp: string): Date {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(isoTimestamp));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return new Date(get("year"), get("month") - 1, get("day"));
}

/** Current wall-clock time in America/Chihuahua as "HH:MM" (24h). */
export function horaChihuahua(): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: TZ,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date());
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  return `${get("hour")}:${get("minute")}`;
}
