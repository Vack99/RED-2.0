import { describe, expect, it } from "vitest";

import type { SesionAgendaDTO } from "@gym/data/server/agenda";

import { derivarDia, derivarDiaSiguiente, derivarFechaHeader, filaDia } from "./inicio-vm";

/**
 * /inicio's Cupo day card derivation (#328): ONE hero class — the class closest to
 * now — carries the CTA, and only the classes still AHEAD row below it. Behavioural
 * coverage for the hero-pick ladder (live wins → ±90 nearest, which may be a
 * just-ended class → next upcoming), the tense-matched hero count (check-ins for
 * dentro/asistieron, bookings only for reservas), the strictly-after rows rule with
 * its no-past-rows invariant, and the null arm (day over / no classes / failed
 * read — and, at the page.tsx caller, Lista's empty `sesiones`).
 */

const TZ = "America/Chihuahua"; // UTC-6 year-round — 13:00Z = 07:00 local.

function dto(over: Partial<SesionAgendaDTO> = {}): SesionAgendaDTO {
  return {
    id: "s1",
    startsAt: new Date("2026-08-08T13:00:00Z"), // 07:00 local
    duracionMin: 60,
    capacidad: 14,
    activos: 9,
    disponibles: 5,
    estado: "normal",
    tipo: "Functional",
    esEspecial: false,
    nombreEspecial: null,
    muestraEspecial: false,
    roomId: null,
    coaches: [],
    templateId: null,
    plantilla: null,
    ...over,
  };
}

// A day: 07:00 Functional, 09:00 Box (Karla), 11:00 Functional — DAL order.
const C1 = dto({ id: "c1", startsAt: new Date("2026-08-08T13:00:00Z"), capacidad: 14, activos: 14 });
const C2 = dto({
  id: "c2",
  startsAt: new Date("2026-08-08T15:00:00Z"),
  capacidad: 12,
  activos: 9,
  tipo: "Box",
  coaches: [{ id: "co1", nombre: "Karla" }],
});
const C3 = dto({ id: "c3", startsAt: new Date("2026-08-08T17:00:00Z"), capacidad: 14, activos: 9 });
const DIA = [C1, C2, C3];

// Today's check-in rows: 4 into c1, 2 into c2, one ACCESO LIBRE (class-less).
const VISITAS = [
  { sessionId: "c1" },
  { sessionId: "c1" },
  { sessionId: "c1" },
  { sessionId: "c1" },
  { sessionId: "c2" },
  { sessionId: "c2" },
  { sessionId: null },
];

/** 09:30 local — c2 is mid-class. */
const LAS_0930 = new Date("2026-08-08T15:30:00Z");

describe("derivarDia — the hero pick", () => {
  it("a live class is the hero: EN CURSO tense, check-ins (never bookings) as the count", () => {
    const dia = derivarDia(DIA, VISITAS, TZ, LAS_0930)!;
    // c2 holds 9 bookings; 2 people are inside, and the ACCESO LIBRE visit is nobody's.
    expect(dia.hero).toEqual({
      id: "c2",
      hora: "09:00",
      titulo: "Box",
      coaches: "Karla",
      tense: "en_curso",
      cuenta: "2/12 dentro",
      esHoy: true,
      etiquetaDia: null,
    });
  });

  it("live WINS over a nearer-by-start-distance ended class", () => {
    const larga = dto({ id: "larga", startsAt: new Date("2026-08-08T13:30:00Z"), duracionMin: 90 }); // 07:30–09:00
    const corta = dto({ id: "corta", startsAt: new Date("2026-08-08T14:45:00Z"), duracionMin: 10 }); // 08:45–08:55
    const las0857 = new Date("2026-08-08T14:57:00Z"); // corta is 12 min away, larga 87 — but larga is LIVE
    const dia = derivarDia([larga, corta], [], TZ, las0857)!;
    expect(dia.hero.id).toBe("larga");
    expect(dia.hero.tense).toBe("en_curso");
  });

  it("no live class: a JUST-ENDED one within ±90 is the hero, in the finished tense with its check-ins", () => {
    const las0830 = new Date("2026-08-08T14:30:00Z"); // c1 ended 08:00; start-distance 90 exactly
    const dia = derivarDia([C1, C3], VISITAS, TZ, las0830)!;
    // 4 checked in of cupo 14 — never the 14 bookings.
    expect(dia.hero).toMatchObject({ id: "c1", tense: "terminada", cuenta: "4/14 asistieron ✓" });
    // The rows under a finished hero are still only what's AHEAD, selling seats.
    expect(dia.clases).toEqual([{ id: "c3", hora: "11:00", nombre: "Functional", cuenta: "9/14" }]);
  });

  it("the ±90 window is inclusive at 90 and closed at 91 — beyond it, the NEXT upcoming class takes over", () => {
    const las0831 = new Date("2026-08-08T14:31:00Z"); // c1 now 91 min away → out of the window
    const dia = derivarDia([C1, C3], VISITAS, TZ, las0831)!;
    expect(dia.hero).toMatchObject({ id: "c3", tense: "proxima", cuenta: "9/14 reservas" });
  });

  it("within ±90 the NEAREST start wins regardless of tense: an upcoming class beats a farther ended one", () => {
    const las0850 = new Date("2026-08-08T14:50:00Z"); // c1 (ended) 110 away, c2 10 away
    const dia = derivarDia(DIA, VISITAS, TZ, las0850)!;
    expect(dia.hero).toMatchObject({ id: "c2", tense: "proxima", cuenta: "9/12 reservas" });
  });

  it("nothing within ±90 and nothing live: the day's FIRST upcoming class is the hero", () => {
    const las0500 = new Date("2026-08-08T11:00:00Z"); // two hours before c1
    const dia = derivarDia(DIA, VISITAS, TZ, las0500)!;
    expect(dia.hero).toMatchObject({ id: "c1", tense: "proxima", cuenta: "14/14 reservas" });
    expect(dia.clases.map((c) => c.id)).toEqual(["c2", "c3"]);
  });

  it("all classes past and out of the window → null (the standalone-CTA arm)", () => {
    const las2300 = new Date("2026-08-09T05:00:00Z");
    expect(derivarDia(DIA, VISITAS, TZ, las2300)).toBeNull();
  });

  it("an empty day is null — Lista's forced no-hero arm and a class-less Cupo day share this same null", () => {
    expect(derivarDia([], VISITAS, TZ, LAS_0930)).toBeNull();
  });
});

describe("derivarDia — the rows", () => {
  it("rows are ONLY the classes strictly after the hero; past classes never render", () => {
    const dia = derivarDia(DIA, VISITAS, TZ, LAS_0930)!;
    expect(dia.clases).toEqual([{ id: "c3", hora: "11:00", nombre: "Functional", cuenta: "9/14" }]);
    expect(dia.clases.some((c) => c.id === "c1")).toBe(false); // 07:00 is history — not a row
  });

  it("the no-past-rows invariant holds in every tense, and no row ever reads ✓/asistieron", () => {
    for (const ahora of [
      new Date("2026-08-08T11:00:00Z"), // 05:00 — proxima fallback (hero c1, rows c2+c3)
      new Date("2026-08-08T14:30:00Z"), // 08:30 — proxima c2 nearest; c1 is history, never a row
      new Date("2026-08-08T15:30:00Z"), // 09:30 — en_curso c2
      new Date("2026-08-08T18:05:00Z"), // 12:05 — terminada c3, nothing ahead
    ]) {
      const dia = derivarDia(DIA, VISITAS, TZ, ahora)!;
      const heroStart = DIA.find((s) => s.id === dia.hero.id)!.startsAt.getTime();
      for (const fila of dia.clases) {
        expect(DIA.find((s) => s.id === fila.id)!.startsAt.getTime()).toBeGreaterThan(heroStart);
        expect(fila.cuenta).toMatch(/^\d+\/\d+$/); // reservas/cupo, nothing else
      }
    }
  });

  it("a row that started after the hero but already finished is NOT listed (peek rows are ahead of NOW, not just ahead of the hero)", () => {
    const larga = dto({ id: "larga", startsAt: new Date("2026-08-08T14:00:00Z"), duracionMin: 120 }); // 08:00–10:00, live
    const corta = dto({ id: "corta", startsAt: new Date("2026-08-08T14:30:00Z"), duracionMin: 30 }); // 08:30–09:00, finished
    const las0905 = new Date("2026-08-08T15:05:00Z"); // 09:05 local
    const dia = derivarDia([larga, corta], [], TZ, las0905)!;
    expect(dia.hero.id).toBe("larga");
    expect(dia.clases).toEqual([]);
  });

  it("a coachless hero reads coaches: null (the title drops its suffix)", () => {
    const las0730 = new Date("2026-08-08T13:30:00Z"); // c1 (coachless) is live
    const dia = derivarDia(DIA, VISITAS, TZ, las0730)!;
    expect(dia.hero).toMatchObject({ id: "c1", coaches: null, tense: "en_curso", cuenta: "4/14 dentro" });
    expect(dia.clases.map((c) => c.id)).toEqual(["c2", "c3"]);
  });
});

describe("derivarDiaSiguiente — the rolled-forward day card (owner ruling 2026-09-01)", () => {
  const HOY = new Date(2026, 7, 8); // local midnight, 8 Aug 2026
  const MANANA = new Date(2026, 7, 9);

  it("the day's FIRST session is the hero, always in the proxima tense, labelled by day", () => {
    const dia = derivarDiaSiguiente([C1, C2, C3], TZ, MANANA, HOY)!;
    expect(dia.hero).toEqual({
      id: "c1",
      hora: "07:00",
      titulo: "Functional",
      coaches: null,
      tense: "proxima",
      cuenta: "14/14 reservas",
      esHoy: false,
      etiquetaDia: "MAÑANA",
    });
  });

  it("the rows are the REST of that day's own schedule, in DAL order", () => {
    const dia = derivarDiaSiguiente([C1, C2, C3], TZ, MANANA, HOY)!;
    expect(dia.clases).toEqual([
      { id: "c2", hora: "09:00", nombre: "Box", cuenta: "9/12" },
      { id: "c3", hora: "11:00", nombre: "Functional", cuenta: "9/14" },
    ]);
  });

  it("further out than tomorrow, the label follows fmtNavegadorDia ('EN N DÍAS')", () => {
    const enTresDias = new Date(2026, 7, 11);
    const dia = derivarDiaSiguiente([C1], TZ, enTresDias, HOY)!;
    expect(dia.hero.etiquetaDia).toBe("EN 3 DÍAS");
  });

  it("an empty day is null — the caller falls back further, or to the standalone CTA", () => {
    expect(derivarDiaSiguiente([], TZ, MANANA, HOY)).toBeNull();
  });

  it("the composed scenario page.tsx runs: today over at 23:55, classes tomorrow 07:00 → hero rolls to tomorrow with no PASAR LISTA", () => {
    const las2355 = new Date("2026-08-08T22:55:00-06:00"); // 23:55 local, C1-3 all long finished
    expect(derivarDia(DIA, VISITAS, TZ, las2355)).toBeNull(); // today itself has nothing left

    const c1Manana = dto({ id: "m1", startsAt: new Date("2026-08-09T13:00:00Z") }); // 07:00 local, next day
    const dia = derivarDiaSiguiente([c1Manana], TZ, MANANA, HOY)!;
    expect(dia.hero.esHoy).toBe(false);
    expect(dia.hero.etiquetaDia).toBe("MAÑANA");
    expect(dia.hero.hora).toBe("07:00");
  });
});

describe("derivarFechaHeader", () => {
  it("builds the big weekday+day line and the small month+year line (owner 2026-09-02)", () => {
    expect(derivarFechaHeader(new Date(2026, 8, 2))).toEqual({
      diaSemana: "MIÉRCOLES 2",
      mesAnio: "SEPTIEMBRE 2026",
    });
  });

  it("uses the caller's already tz-resolved Date's local components, never a fresh clock read", () => {
    expect(derivarFechaHeader(new Date(2026, 7, 8))).toEqual({
      diaSemana: "SÁBADO 8",
      mesAnio: "AGOSTO 2026",
    });
  });
});

describe("filaDia", () => {
  it("shapes a row: gym-local hora, agenda-parity name, reservas/cupo", () => {
    expect(filaDia(C3, TZ)).toEqual({ id: "c3", hora: "11:00", nombre: "Functional", cuenta: "9/14" });
  });

  it("names a class as the Agenda does: especial name, 'Especial' when unnamed", () => {
    expect(filaDia(dto({ esEspecial: true, nombreEspecial: "Open box" }), TZ).nombre).toBe("Open box");
    expect(filaDia(dto({ esEspecial: true, nombreEspecial: "  " }), TZ).nombre).toBe("Especial");
    expect(filaDia(dto({ esEspecial: false }), TZ).nombre).toBe("Functional");
  });
});
