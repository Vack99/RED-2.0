// Real (non-mock) calendar helpers for the Supabase era. The domain rules
// (src/domain/rules.ts) read a Date's LOCAL components, so every Date handed to
// them must carry the Chihuahua calendar Y/M/D in its local fields. These helpers
// bridge the wall clock + Postgres `date` strings into that shape.
//
// src/lib/date.ts holds the pure local-component calendar math (labels + isoDay);
// this module adds the Chihuahua-tz wall clock + Postgres `date` parsing on top.
// `toIsoDay` is date.isoDay re-exported so the local-field serialization lives in
// exactly one place (callers in the DAL import it from here, screens from date).

import { isoDay } from "./date";

export const TZ = "America/Chihuahua";

// Hoisted once — Intl.DateTimeFormat construction is the cost, so a single
// reused formatter beats building it fresh per call (js-hoist-intl).
const CHIHUAHUA_YMD = new Intl.DateTimeFormat("en-CA", {
  timeZone: TZ,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today in America/Chihuahua, as a Date whose local Y/M/D = the Chihuahua date. */
export function hoyChihuahua(): Date {
  const parts = CHIHUAHUA_YMD.formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return new Date(get("year"), get("month") - 1, get("day"));
}

/** Parse a Postgres `date` ("YYYY-MM-DD") into a local-midnight Date. */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Serialize a Date to a Postgres `date` literal ("YYYY-MM-DD") using local fields.
 *  Single-sourced from date.isoDay — same local-component serialization, one home. */
export const toIsoDay = isoDay;

/** Today's iso day in America/Chihuahua ("YYYY-MM-DD"). */
export function hoyIsoChihuahua(): string {
  return toIsoDay(hoyChihuahua());
}

/** The Chihuahua-local calendar Date for a timestamptz string (handles tz drift). */
export function fechaChihuahua(isoTimestamp: string): Date {
  const parts = CHIHUAHUA_YMD.formatToParts(new Date(isoTimestamp));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return new Date(get("year"), get("month") - 1, get("day"));
}
