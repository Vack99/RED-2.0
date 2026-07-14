import { describe, expect, it } from "vitest";

import { materializarSesion } from "@gym/domain/rules";
import { instanteEnZona } from "@gym/format";

// The two-pass DST resolution lives in TWO homes by boundary necessity
// (@gym/domain may not import @gym/format — it is the innermost leaf), so
// instanteEnZona and materializarSesion each carry a hand-synced copy. This
// suite pins them in LOCKSTEP on the DST edges, so a future edit to one copy
// cannot silently drift the other (elegance audit 2026-07-13). @gym/data may
// import both, which is why the pin lives here.
describe("DST two-pass lockstep — instanteEnZona ⇄ materializarSesion", () => {
  const CASES = [
    { dia: new Date(2026, 2, 8), tz: "America/Tijuana" }, // spring-forward Sunday
    { dia: new Date(2026, 10, 1), tz: "America/Tijuana" }, // fall-back Sunday
    { dia: new Date(2026, 8, 6), tz: "America/Santiago" }, // gap-midnight Sunday
    { dia: new Date(2026, 6, 15), tz: "America/Chihuahua" }, // DST-free control
  ];

  it("materializes the exact instant instanteEnZona resolves, on every DST edge and a control", () => {
    for (const { dia, tz } of CASES) {
      for (const hhmm of ["00:00", "06:00", "22:45"]) {
        // The week's Monday + the day's weekday offset (0=Lunes..6=Domingo).
        const weekday = (dia.getDay() + 6) % 7;
        const lunes = new Date(dia.getFullYear(), dia.getMonth(), dia.getDate() - weekday);
        const viaFormat = instanteEnZona(dia, hhmm, tz);
        const viaDomain = materializarSesion({ weekday, startTime: hhmm }, lunes, tz);
        expect(viaDomain.toISOString(), `${tz} ${dia.toDateString()} ${hhmm}`).toBe(
          viaFormat.toISOString(),
        );
      }
    }
  });
});
