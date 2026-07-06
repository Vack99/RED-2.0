import { describe, expect, it } from "vitest";

import {
  fmtDiaAgenda,
  fmtEyebrow,
  fmtMesAnio,
  fmtNavegadorDia,
  fmtNavegadorSemana,
  fmtResumenDia,
  fmtResumenDiaSemana,
  fmtResumenSemana,
  inicioSemana,
  pasoDia,
  semanaLunSab,
} from "./date";

// Fixed date: Wed 27 May 2026 (months are 0-based).
const HOY = new Date(2026, 4, 27);

describe("fmtEyebrow", () => {
  it("formats the greeting eyebrow with the year", () => {
    expect(fmtEyebrow(HOY)).toBe("MIÉ · 27 MAY 2026");
  });
});

describe("fmtMesAnio", () => {
  it("formats the uppercased month + year", () => {
    expect(fmtMesAnio(HOY)).toBe("MAYO 2026");
  });
});

// ── Agenda formatting (Phase 5, ADR-0010) ────────────────────────────────

describe("fmtDiaAgenda", () => {
  it('formats the Agenda day heading, matching the approved mock ("MIÉ 17 JUN")', () => {
    expect(fmtDiaAgenda(new Date(2026, 5, 17))).toBe("MIÉ 17 JUN");
  });
});

describe("fmtResumenDia", () => {
  it('formats "N clases · M reservas", matching the mock ("6 clases · 109 reservas")', () => {
    expect(fmtResumenDia(6, 109)).toBe("6 clases · 109 reservas");
  });
  it('singularizes "1 clase"', () => {
    expect(fmtResumenDia(1, 5)).toBe("1 clase · 5 reservas");
  });
  it("is honest about an empty day", () => {
    expect(fmtResumenDia(0, 0)).toBe("0 clases · 0 reservas");
  });
});

describe("fmtResumenDiaSemana", () => {
  it('formats the SEMANA day-group header "N clases · X%"', () => {
    expect(fmtResumenDiaSemana(6, 0.9)).toBe("6 clases · 90%");
  });
  it('singularizes "1 clase"', () => {
    expect(fmtResumenDiaSemana(1, 0.5)).toBe("1 clase · 50%");
  });
  it("rounds the percentage", () => {
    expect(fmtResumenDiaSemana(4, 0.667)).toBe("4 clases · 67%");
  });
});

describe("fmtResumenSemana", () => {
  it('formats the week footer "Semana · X% ocupación"', () => {
    expect(fmtResumenSemana(0.72)).toBe("Semana · 72% ocupación");
  });
  it("rounds the percentage", () => {
    expect(fmtResumenSemana(0.855)).toBe("Semana · 86% ocupación");
  });
});

describe("fmtNavegadorDia", () => {
  it("labels today, tomorrow, and yesterday", () => {
    expect(fmtNavegadorDia(HOY, HOY)).toBe("Hoy");
    expect(fmtNavegadorDia(new Date(2026, 4, 28), HOY)).toBe("Mañana");
    expect(fmtNavegadorDia(new Date(2026, 4, 26), HOY)).toBe("Ayer");
  });
  it("labels a future day as 'En N días'", () => {
    expect(fmtNavegadorDia(new Date(2026, 4, 30), HOY)).toBe("En 3 días");
  });
  it("labels a past day as 'Hace N días'", () => {
    expect(fmtNavegadorDia(new Date(2026, 4, 22), HOY)).toBe("Hace 5 días");
  });
});

describe("fmtNavegadorSemana", () => {
  // Weeks are keyed by their Monday.
  const LUNES_HOY = new Date(2026, 4, 25); // Mon 25 may 2026 (week containing HOY)

  it("labels this week, next week, and last week", () => {
    expect(fmtNavegadorSemana(LUNES_HOY, LUNES_HOY)).toBe("Esta semana");
    expect(fmtNavegadorSemana(new Date(2026, 5, 1), LUNES_HOY)).toBe("Próxima semana");
    expect(fmtNavegadorSemana(new Date(2026, 4, 18), LUNES_HOY)).toBe("Semana anterior");
  });
  it("labels further-out weeks as 'En N semanas' / 'Hace N semanas'", () => {
    expect(fmtNavegadorSemana(new Date(2026, 5, 8), LUNES_HOY)).toBe("En 2 semanas");
    expect(fmtNavegadorSemana(new Date(2026, 4, 11), LUNES_HOY)).toBe("Hace 2 semanas");
  });
});

describe("inicioSemana / semanaLunSab (Lun-Sáb week-strip math)", () => {
  it("resolves the Monday of the week for any Lun-Sáb day, matching the mock's Lun15..Sáb20 strip", () => {
    for (let dia = 15; dia <= 20; dia++) {
      expect(inicioSemana(new Date(2026, 5, dia))).toEqual(new Date(2026, 5, 15));
    }
  });
  it("rolls a Domingo forward to the FOLLOWING week's Monday (no Domingo class day)", () => {
    const domingo = new Date(2026, 5, 21); // Sun 21 jun 2026
    expect(inicioSemana(domingo)).toEqual(new Date(2026, 5, 22));
  });
  it("builds the six Lun-Sáb dates of the week", () => {
    const strip = semanaLunSab(new Date(2026, 5, 17)); // any day in the week
    expect(strip.map((d) => d.getDate())).toEqual([15, 16, 17, 18, 19, 20]);
  });
});

describe("pasoDia (±1 day navigator step, wraps Sáb→Lun / Lun→Sáb)", () => {
  it("steps forward normally within the week", () => {
    expect(pasoDia(new Date(2026, 5, 17), 1)).toEqual(new Date(2026, 5, 18)); // Mié -> Jue
  });
  it("wraps Sábado forward to the FOLLOWING week's Lunes (skips Domingo)", () => {
    expect(pasoDia(new Date(2026, 5, 20), 1)).toEqual(new Date(2026, 5, 22)); // Sáb -> Lun
  });
  it("steps backward normally within the week", () => {
    expect(pasoDia(new Date(2026, 5, 17), -1)).toEqual(new Date(2026, 5, 16)); // Mié -> Mar
  });
  it("wraps Lunes backward to the PRIOR week's Sábado (skips Domingo)", () => {
    expect(pasoDia(new Date(2026, 5, 15), -1)).toEqual(new Date(2026, 5, 13)); // Lun -> Sáb
  });
});
