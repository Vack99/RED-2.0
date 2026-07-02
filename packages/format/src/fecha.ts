// Real (non-mock) calendar helpers for the Supabase era. The domain rules
// (src/domain/rules.ts) read a Date's LOCAL components, so every Date handed to
// them must carry the GYM-LOCAL calendar Y/M/D in its local fields. These helpers
// bridge the wall clock + Postgres `date` strings into that shape, given the
// caller's resolved IANA zone (per-gym — audit finding 1, PRD #17 named
// exception: @gym/format never reads a gym row itself, only ever a `tz` arg).
//
// date.ts holds the pure local-component calendar math (labels + isoDay); this
// module adds the tz-aware wall clock + Postgres `date` parsing on top.
// `toIsoDay` is date.isoDay re-exported so the local-field serialization lives in
// exactly one place.

import { isoDay } from "./date";

// One Intl.DateTimeFormat PER DISTINCT zone, built once and reused (js-hoist-intl):
// `tz` is now a runtime argument, not a fixed constant, so a single module-level
// formatter no longer works — this small cache keeps the "construct once" property
// for whichever zones actually get used (in practice: one per gym).
const ymdFormatters = new Map<string, Intl.DateTimeFormat>();
function ymdFormatterFor(tz: string): Intl.DateTimeFormat {
  let fmt = ymdFormatters.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: tz,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    ymdFormatters.set(tz, fmt);
  }
  return fmt;
}

/** Today in the given IANA zone, as a Date whose local Y/M/D = that zone's calendar date. */
export function hoyEnZona(tz: string): Date {
  const parts = ymdFormatterFor(tz).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return new Date(get("year"), get("month") - 1, get("day"));
}

/** Parse a Postgres `date` ("YYYY-MM-DD") into a local-midnight Date. A `date`
 *  column carries no timezone of its own, so this never takes a `tz`. */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Serialize a Date to a Postgres `date` literal ("YYYY-MM-DD") using local fields.
 *  Single-sourced from date.isoDay — same local-component serialization, one home. */
export const toIsoDay = isoDay;

/** Today's iso day in the given IANA zone ("YYYY-MM-DD"). */
export function hoyIsoEnZona(tz: string): string {
  return toIsoDay(hoyEnZona(tz));
}

/** The zone-local calendar Date for a timestamptz string (handles tz drift). */
export function fechaEnZona(isoTimestamp: string, tz: string): Date {
  const parts = ymdFormatterFor(tz).formatToParts(new Date(isoTimestamp));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return new Date(get("year"), get("month") - 1, get("day"));
}
