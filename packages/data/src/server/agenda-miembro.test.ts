import { describe, expect, it } from "vitest";

import { instanteEnZona } from "@gym/format";

import { getAgendaSemanaMiembro } from "./agenda-miembro";
import type { SupabaseServer } from "./supabase";

/**
 * The member-facing agenda reader (PRD #49 S3, slice #56) — the seam BESIDE the
 * staff-gated getAgendaSemana (two auth contexts, not duplication). It takes an
 * injectable client (ADR-0001), so orchestration — the member-gym resolution, the
 * tz-honest week window, the join assembly, the derived-estado wiring (0-active
 * projection until booking ships), and the display-ready formatting — is testable
 * with a hand-rolled fake. RLS is the only gate (no operator check); the anon /
 * no-membership denial is proven at the DB layer in the SQL denial suite.
 */

const TZ = "America/Chihuahua"; // UTC-6, DST-free in 2026

// A week safely in the PAST relative to any test-run date → every session resolves
// deterministically to "termino".
const LUNES_PASADO = new Date(2020, 5, 15); // Mon 15 jun 2020
const MIERCOLES_PASADO = new Date(2020, 5, 17);
// A week safely in the FUTURE → the day's first session is "a_continuacion", the
// rest "normal", none "termino".
const LUNES_FUTURO = new Date(2099, 5, 15); // Mon 15 jun 2099 (a Monday)

function iso(dia: Date, hhmm: string): string {
  return instanteEnZona(dia, hhmm, TZ).toISOString();
}

interface Rows {
  gym_membership?: Record<string, unknown>[];
  class_session?: Record<string, unknown>[];
  class_type?: Record<string, unknown>[];
  class_session_coach?: Record<string, unknown>[];
  coach?: Record<string, unknown>[];
  gymTimezone?: string;
}

function makeFake(rows: Rows = {}) {
  function builder(list: Record<string, unknown>[]) {
    let filtered = list;
    let orderCol: string | null = null;
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (col: string, val: unknown) => {
        filtered = filtered.filter((r) => r[col] === val);
        return b;
      },
      is: (col: string, val: unknown) => {
        filtered = filtered.filter((r) => r[col] === val);
        return b;
      },
      gte: (col: string, val: unknown) => {
        filtered = filtered.filter((r) => (r[col] as string) >= (val as string));
        return b;
      },
      lt: (col: string, val: unknown) => {
        filtered = filtered.filter((r) => (r[col] as string) < (val as string));
        return b;
      },
      in: (col: string, vals: unknown[]) => {
        filtered = filtered.filter((r) => vals.includes(r[col]));
        return b;
      },
      order: (col: string) => {
        orderCol = col;
        return b;
      },
      limit: () => b,
      maybeSingle: async () => ({ data: filtered[0] ?? null, error: null }),
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) => {
        const out = orderCol
          ? [...filtered].sort((a, b2) =>
              (a[orderCol as string] as string) > (b2[orderCol as string] as string) ? 1 : -1,
            )
          : filtered;
        return resolve({ data: out, error: null });
      },
    };
    return b;
  }

  const membership =
    rows.gym_membership === undefined ? [{ gym_id: "gym-1" }] : rows.gym_membership;

  const client = {
    from: (table: string) => {
      if (table === "gym_membership") return builder(membership);
      if (table === "gym") return builder([{ id: "gym-1", timezone: rows.gymTimezone ?? TZ }]);
      return builder((rows as Record<string, Record<string, unknown>[]>)[table] ?? []);
    },
  };
  return client as unknown as SupabaseServer;
}

const pastRows = (): Rows => ({
  class_session: [
    {
      id: "mon1",
      class_type_id: "ct1",
      starts_at: iso(LUNES_PASADO, "06:15"),
      duration_min: 45,
      capacity: 24,
      cancelled_at: null,
    },
    {
      id: "wed1",
      class_type_id: "ct2",
      starts_at: iso(MIERCOLES_PASADO, "18:15"),
      duration_min: 60,
      capacity: 20,
      cancelled_at: null,
    },
    {
      // previous week — must be excluded from this Lun-Sáb window
      id: "prev",
      class_type_id: "ct1",
      starts_at: iso(new Date(2020, 5, 8), "08:00"),
      duration_min: 45,
      capacity: 24,
      cancelled_at: null,
    },
    {
      // cancelled — excluded
      id: "cancel",
      class_type_id: "ct1",
      starts_at: iso(MIERCOLES_PASADO, "12:00"),
      duration_min: 45,
      capacity: 24,
      cancelled_at: "2020-06-16T00:00:00Z",
    },
  ],
  class_type: [
    { id: "ct1", name: "Fuerza" },
    { id: "ct2", name: "Metcon" },
  ],
  class_session_coach: [
    { session_id: "mon1", coach_id: "co1" },
    { session_id: "wed1", coach_id: "co1" },
    { session_id: "wed1", coach_id: "co2" },
  ],
  coach: [
    { id: "co1", name: "Ángel" },
    { id: "co2", name: "Marisa" },
  ],
});

describe("getAgendaSemanaMiembro", () => {
  it("returns six Lun-Sáb day entries with weekday label, dnum and iso", async () => {
    const semana = await getAgendaSemanaMiembro("2020-06-17", makeFake(pastRows()));
    expect(semana.dias).toHaveLength(6);
    expect(semana.dias.map((d) => d.weekday)).toEqual(["LUN", "MAR", "MIÉ", "JUE", "VIE", "SÁB"]);
    expect(semana.dias.map((d) => d.dnum)).toEqual([15, 16, 17, 18, 19, 20]);
    expect(semana.dias[0].iso).toBe("2020-06-15");
  });

  it("groups each session into its own local day; other days are empty", async () => {
    const semana = await getAgendaSemanaMiembro("2020-06-17", makeFake(pastRows()));
    expect(semana.dias[0].sesiones.map((s) => s.id)).toEqual(["mon1"]);
    expect(semana.dias[2].sesiones.map((s) => s.id)).toEqual(["wed1"]);
    expect(semana.dias[1].sesiones).toEqual([]);
  });

  it("excludes cancelled sessions and sessions outside the Lun-Sáb window", async () => {
    const semana = await getAgendaSemanaMiembro("2020-06-17", makeFake(pastRows()));
    const allIds = semana.dias.flatMap((d) => d.sesiones.map((s) => s.id));
    expect(allIds).toEqual(["mon1", "wed1"]);
  });

  it("formats hora (gym tz), duración label and the coaches string", async () => {
    const semana = await getAgendaSemanaMiembro("2020-06-17", makeFake(pastRows()));
    const wed = semana.dias[2].sesiones[0];
    expect(wed.tipo).toBe("Metcon");
    expect(wed.hora).toBe("18:15");
    expect(wed.duracionLabel).toBe("60 min");
    expect(wed.coaches).toBe("Ángel · Marisa");
  });

  it("labels a session with no coach join 'Por asignar'", async () => {
    const rows = pastRows();
    rows.class_session_coach = [];
    const semana = await getAgendaSemanaMiembro("2020-06-17", makeFake(rows));
    const withCoaches = semana.dias.flatMap((d) => d.sesiones);
    expect(withCoaches.every((s) => s.coaches === "Por asignar")).toBe(true);
  });

  it("derives the 0-active occupancy projection: disponibles == capacidad, ocupacionPct 0", async () => {
    const semana = await getAgendaSemanaMiembro("2020-06-17", makeFake(pastRows()));
    for (const s of semana.dias.flatMap((d) => d.sesiones)) {
      expect(s.disponibles).toBe(s.capacidad);
      expect(s.ocupacionPct).toBe(0);
    }
  });

  it("resolves every past session to estado 'termino' via the domain ladder", async () => {
    const semana = await getAgendaSemanaMiembro("2020-06-17", makeFake(pastRows()));
    for (const s of semana.dias.flatMap((d) => d.sesiones)) {
      expect(s.estado).toBe("termino");
    }
  });

  it("marks a future day's first session 'a_continuacion' and the rest 'normal'", async () => {
    const rows: Rows = {
      class_session: [
        {
          id: "f1",
          class_type_id: "ct1",
          starts_at: iso(LUNES_FUTURO, "06:15"),
          duration_min: 45,
          capacity: 24,
          cancelled_at: null,
        },
        {
          id: "f2",
          class_type_id: "ct1",
          starts_at: iso(LUNES_FUTURO, "18:15"),
          duration_min: 45,
          capacity: 24,
          cancelled_at: null,
        },
      ],
      class_type: [{ id: "ct1", name: "Fuerza" }],
      class_session_coach: [],
      coach: [],
    };
    const semana = await getAgendaSemanaMiembro("2099-06-15", makeFake(rows));
    const lunes = semana.dias[0].sesiones;
    expect(lunes.map((s) => s.estado)).toEqual(["a_continuacion", "normal"]);
  });

  it("defaults to the current week (gym tz) when no date is given: one día is today", async () => {
    const semana = await getAgendaSemanaMiembro(undefined, makeFake({ class_session: [], class_type: [], class_session_coach: [], coach: [] }));
    expect(semana.dias).toHaveLength(6);
    // Today may be a Sunday (no Lun-Sáb slot); when it is a class day exactly one día is today.
    expect(semana.dias.filter((d) => d.esHoy).length).toBeLessThanOrEqual(1);
  });

  it("throws when the caller has no membership (anon / non-member — RLS returns no gym row)", async () => {
    await expect(
      getAgendaSemanaMiembro("2020-06-17", makeFake({ gym_membership: [] })),
    ).rejects.toThrow();
  });
});
