import { describe, expect, it } from "vitest";

import { fechaEnZona, hoyEnZona, hoyIsoEnZona } from "./fecha";

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
