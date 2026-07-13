import { describe, expect, it } from "vitest";

import { fechaEnZona, horaEnZona, hoyEnZona, hoyIsoEnZona, instanteEnZona } from "./fecha";

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

// DST correctness (spec 2026-07-13 §1.7): the offset must be re-derived at the
// candidate instant, not sampled at the guess — a transition between the two
// shifts the Agenda write path by an hour. Rules: a nonexistent wall clock (gap)
// resolves to the transition instant; an ambiguous one (overlap) to the EARLIER
// instant. Expected values are hand-derived from the IANA rules for each zone,
// never from the code under test.
describe("instanteEnZona — DST transitions", () => {
  it("Tijuana (kept US DST post-2022-reform): 06:00 on the spring-forward Sunday is 06:00 PDT, not 07:00 — the live Agenda bug", () => {
    // 2026-03-08: clocks jump 02:00 PST → 03:00 PDT at 10:00Z. 06:00 PDT = UTC-7.
    const instante = instanteEnZona(new Date(2026, 2, 8), "06:00", "America/Tijuana");
    expect(instante.toISOString()).toBe("2026-03-08T13:00:00.000Z");
  });

  it("Tijuana: 06:00 on the fall-back Sunday is 06:00 PST, not 05:00", () => {
    // 2026-11-01: clocks fall 02:00 PDT → 01:00 PST at 09:00Z. 06:00 PST = UTC-8.
    const instante = instanteEnZona(new Date(2026, 10, 1), "06:00", "America/Tijuana");
    expect(instante.toISOString()).toBe("2026-11-01T14:00:00.000Z");
  });

  it("Santiago: the day bound on the April fall-back Sunday is Sunday 00:00 CLT, not Saturday 23:00 — the −1h-every-April day bound", () => {
    // 2026-04-05: clocks fall 00:00 CLST (UTC-3) → 23:00 Sat CLT (UTC-4) at 03:00Z.
    // Sunday 00:00 CLT is therefore 04:00Z.
    const instante = instanteEnZona(new Date(2026, 3, 5), "00:00", "America/Santiago");
    expect(instante.toISOString()).toBe("2026-04-05T04:00:00.000Z");
  });

  it("Santiago: the NONEXISTENT spring-forward midnight resolves to the transition instant (the moment the day actually began)", () => {
    // 2026-09-06: clocks jump 00:00 CLT (UTC-4) → 01:00 CLST (UTC-3) at 04:00Z.
    // Local 00:00 never happens; the day begins at the transition instant 04:00Z.
    const instante = instanteEnZona(new Date(2026, 8, 6), "00:00", "America/Santiago");
    expect(instante.toISOString()).toBe("2026-09-06T04:00:00.000Z");
  });

  it("Havana: the NONEXISTENT spring-forward midnight resolves to the transition instant", () => {
    // 2026-03-08: clocks jump 00:00 CST (UTC-5) → 01:00 CDT (UTC-4) at 05:00Z.
    const instante = instanteEnZona(new Date(2026, 2, 8), "00:00", "America/Havana");
    expect(instante.toISOString()).toBe("2026-03-08T05:00:00.000Z");
  });

  it("Havana: the AMBIGUOUS fall-back midnight (a month bound) picks the EARLIER of its two instants", () => {
    // 2026-11-01: clocks fall 01:00 CDT (UTC-4) → 00:00 CST (UTC-5) at 05:00Z, so
    // 00:00 happens twice: 04:00Z (CDT) and 05:00Z (CST). A month bound must take 04:00Z.
    const instante = instanteEnZona(new Date(2026, 10, 1), "00:00", "America/Havana");
    expect(instante.toISOString()).toBe("2026-11-01T04:00:00.000Z");
  });

  it("Beirut (UTC-positive DST zone, control): an ordinary summer wall clock resolves through EEST (UTC+3)", () => {
    const instante = instanteEnZona(new Date(2026, 6, 15), "18:00", "Asia/Beirut");
    expect(instante.toISOString()).toBe("2026-07-15T15:00:00.000Z");
  });

  it("Bogotá (fixed-offset zone, control): UTC-5 year-round, transitions never fire", () => {
    const instante = instanteEnZona(new Date(2026, 7, 10), "06:00", "America/Bogota");
    expect(instante.toISOString()).toBe("2026-08-10T11:00:00.000Z");
  });
});

// The read-side sibling of instanteEnZona: an absolute instant (a class_session's
// starts_at) rendered as the gym-local "HH:MM" wall clock the Agenda card shows.
describe("horaEnZona", () => {
  it("renders the wall clock in the gym zone (2026 Chihuahua GMT-6): a midday UTC instant reads 12:00", () => {
    expect(horaEnZona(new Date("2026-05-20T18:00:00Z"), CHIHUAHUA)).toBe("12:00");
  });

  it("is the exact read-back of instanteEnZona for a fixed wall clock (both zones)", () => {
    for (const tz of [CHIHUAHUA, MEXICO_CITY]) {
      const instante = instanteEnZona(new Date(2026, 5, 17), "08:15", tz);
      expect(horaEnZona(instante, tz)).toBe("08:15");
    }
  });

  it("proves `tz` genuinely changes the result: a pre-2022-reform 1h-offset instant reads DIFFERENT wall clocks", () => {
    // 2020-07-01T05:30:00Z -> Chihuahua (GMT-6) 23:30 ; Mexico City (GMT-5 DST) 00:30.
    const instante = new Date("2020-07-01T05:30:00Z");
    expect(horaEnZona(instante, CHIHUAHUA)).toBe("23:30");
    expect(horaEnZona(instante, MEXICO_CITY)).toBe("00:30");
  });

  it("renders local midnight as 00:00, never 24:00", () => {
    // 2026-05-20T06:00:00Z -> Chihuahua (GMT-6) 2026-05-20 00:00.
    expect(horaEnZona(new Date("2026-05-20T06:00:00Z"), CHIHUAHUA)).toBe("00:00");
  });
});
