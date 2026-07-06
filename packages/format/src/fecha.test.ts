import { describe, expect, it } from "vitest";

import { fechaEnZona, hoyEnZona, hoyIsoEnZona, instanteEnZona } from "./fecha";

// Two zones, both currently DST-free per IANA tzdata for 2026 (the 2022 Mexican
// reform dropped DST everywhere except a narrow US-border strip that excludes
// both Chihuahua city and Mexico City) — the per-gym case this slice threads.
const CHIHUAHUA = "America/Chihuahua";
const MEXICO_CITY = "America/Mexico_City";

describe("fechaEnZona", () => {
  it("resolves a UTC midday timestamp to the SAME calendar day in both zones (2026, both GMT-6)", () => {
    const iso = "2026-05-20T18:00:00Z";
    const chi = fechaEnZona(iso, CHIHUAHUA);
    const mex = fechaEnZona(iso, MEXICO_CITY);
    expect([chi.getFullYear(), chi.getMonth(), chi.getDate()]).toEqual([2026, 4, 20]);
    expect([mex.getFullYear(), mex.getMonth(), mex.getDate()]).toEqual([2026, 4, 20]);
  });

  it("proves `tz` genuinely changes the result: a historical 1h-offset instant (Chihuahua GMT-6 / Mexico City GMT-5, pre-2022-reform DST) rolls to DIFFERENT calendar days", () => {
    // 2020-07-01T05:30:00Z -> Chihuahua (GMT-6) local 2020-06-30 23:30 (June 30);
    // Mexico City (GMT-5, still on summer DST pre-reform) local 2020-07-01 00:30 (July 1).
    const iso = "2020-07-01T05:30:00Z";
    const chi = fechaEnZona(iso, CHIHUAHUA);
    const mex = fechaEnZona(iso, MEXICO_CITY);
    expect([chi.getFullYear(), chi.getMonth(), chi.getDate()]).toEqual([2020, 5, 30]); // June 30
    expect([mex.getFullYear(), mex.getMonth(), mex.getDate()]).toEqual([2020, 6, 1]); // July 1
  });

  it("re-used across calls with the SAME tz string (formatter cache) still resolves correctly", () => {
    const a = fechaEnZona("2026-01-01T12:00:00Z", CHIHUAHUA);
    const b = fechaEnZona("2026-12-25T12:00:00Z", CHIHUAHUA);
    expect([a.getFullYear(), a.getMonth(), a.getDate()]).toEqual([2026, 0, 1]);
    expect([b.getFullYear(), b.getMonth(), b.getDate()]).toEqual([2026, 11, 25]);
  });
});

describe("hoyEnZona / hoyIsoEnZona", () => {
  it("returns a Date whose local Y/M/D matches Intl's formatToParts for the given zone (both zones)", () => {
    for (const tz of [CHIHUAHUA, MEXICO_CITY]) {
      const viaHelper = hoyEnZona(tz);
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone: tz,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(new Date());
      const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
      expect(viaHelper.getFullYear()).toBe(get("year"));
      expect(viaHelper.getMonth()).toBe(get("month") - 1);
      expect(viaHelper.getDate()).toBe(get("day"));
    }
  });

  it("hoyIsoEnZona is hoyEnZona serialized to YYYY-MM-DD, for both zones", () => {
    for (const tz of [CHIHUAHUA, MEXICO_CITY]) {
      const iso = hoyIsoEnZona(tz);
      const d = hoyEnZona(tz);
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      expect(iso).toBe(`${y}-${m}-${day}`);
    }
  });
});

// The write-side inverse of fechaEnZona (Agenda mutations + reader window bounds,
// PRD #36 decision k / ADR-0010 §k): a gym-local calendar date + "HH:MM" wall clock,
// resolved to the absolute UTC instant in a given IANA zone.
describe("instanteEnZona", () => {
  it("round-trips: the instant, read back through the SAME tz, reproduces the wall clock it was built from", () => {
    const dia = new Date(2026, 5, 17); // Wed 17 jun 2026
    const instante = instanteEnZona(dia, "18:00", CHIHUAHUA);
    const dtf = new Intl.DateTimeFormat("en-CA", {
      timeZone: CHIHUAHUA,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    const parts = dtf.formatToParts(instante);
    const get = (t: string) => parts.find((p) => p.type === t)!.value;
    expect(`${get("year")}-${get("month")}-${get("day")} ${get("hour")}:${get("minute")}`).toBe(
      "2026-06-17 18:00",
    );
  });

  it("is tz-honest: the same wall clock in two different gym zones yields two different absolute instants (Chihuahua GMT-6 / Mexico City GMT-5, pre-2022-reform June DST)", () => {
    const dia = new Date(2020, 5, 15); // Mon 15 jun 2020
    const chi = instanteEnZona(dia, "18:00", CHIHUAHUA);
    const mex = instanteEnZona(dia, "18:00", MEXICO_CITY);
    expect(chi.getTime()).not.toBe(mex.getTime());
    expect((chi.getTime() - mex.getTime()) / 3_600_000).toBe(1); // Chihuahua 1h behind that June
  });

  it("is the exact inverse of fechaEnZona for a midday instant (no DST edge)", () => {
    const dia = new Date(2026, 0, 15); // 15 ene 2026
    const instante = instanteEnZona(dia, "12:00", CHIHUAHUA);
    const back = fechaEnZona(instante.toISOString(), CHIHUAHUA);
    expect([back.getFullYear(), back.getMonth(), back.getDate()]).toEqual([2026, 0, 15]);
  });

  it("advances the instant by exactly one day when the wall-clock day advances (both zones)", () => {
    for (const tz of [CHIHUAHUA, MEXICO_CITY]) {
      const a = instanteEnZona(new Date(2026, 5, 17), "06:00", tz);
      const b = instanteEnZona(new Date(2026, 5, 18), "06:00", tz);
      expect(Math.round((b.getTime() - a.getTime()) / 86_400_000)).toBe(1);
    }
  });
});
