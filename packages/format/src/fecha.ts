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

// ── Agenda write-side tz math (Phase 5, ADR-0010 §k) ─────────────────────
// The Agenda DAL resolves EVERY absolute instant it sends to a scheduling RPC —
// and every reader window bound — through instanteEnZona, never re-deriving the
// offset trick per call site. `@gym/domain`'s materializarSesion needs the exact
// same two-pass technique for its own (template, week) instant; the two packages
// are siblings, not layered (see the module header), so this is the same small,
// deliberate duplication as date.ts's difDias/mismoDia — not an oversight.
function offsetMsEnZona(utcMs: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asIfUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour") % 24,
    get("minute"),
    get("second"),
  );
  return asIfUtc - utcMs;
}

/**
 * The absolute UTC instant for a gym-local wall clock: `diaLocal`'s Y/M/D fields
 * + an "HH:MM" time, interpreted in `tz`. The write-side inverse of fechaEnZona —
 * every Agenda mutation that submits a `starts_at` (crear/editar sesión) and both
 * day/week readers' window bounds resolve through here.
 */
export function instanteEnZona(diaLocal: Date, hhmm: string, tz: string): Date {
  const [hh, mm] = hhmm.split(":").map(Number);
  const guess = Date.UTC(diaLocal.getFullYear(), diaLocal.getMonth(), diaLocal.getDate(), hh, mm);
  return new Date(guess - offsetMsEnZona(guess, tz));
}
