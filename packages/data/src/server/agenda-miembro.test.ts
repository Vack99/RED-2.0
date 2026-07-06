import { describe, expect, it } from "vitest";

import { instanteEnZona } from "@gym/format";

import { getAgendaSemanaMiembro, getSaldoMiembro } from "./agenda-miembro";
import type { SupabaseServer } from "./supabase";

/**
 * The member-facing agenda reader (PRD #49 S3, slice #56/#57) — the seam BESIDE the
 * staff-gated getAgendaSemana (two auth contexts, not duplication). It takes an
 * injectable client (ADR-0001), so orchestration — the member-gym resolution, the
 * tz-honest week window, the join assembly, the derived-estado wiring (occupancy via
 * the contar_reservas_activas count seam, slice #57), the own-reservation flag, and
 * the display-ready formatting — is testable with a hand-rolled fake. RLS is the only
 * gate (no operator check); the anon / no-membership denial is proven at the DB layer.
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
  reservation?: Record<string, unknown>[];
  clientes?: Record<string, unknown>[];
  gymTimezone?: string;
}

function makeFake(
  rows: Rows = {},
  rpc?: (name: string, args: Record<string, unknown>) => { data: unknown; error: unknown },
) {
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
    rpc: (name: string, args: Record<string, unknown>) =>
      Promise.resolve(rpc ? rpc(name, args) : { data: [], error: null }),
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

  it("no active reservations (count seam empty): disponibles == capacidad, ocupacionPct 0, miReserva false", async () => {
    const semana = await getAgendaSemanaMiembro("2020-06-17", makeFake(pastRows()));
    for (const s of semana.dias.flatMap((d) => d.sesiones)) {
      expect(s.disponibles).toBe(s.capacidad);
      expect(s.ocupacionPct).toBe(0);
      expect(s.miReserva).toBe(false);
    }
  });

  it("wires the count seam into disponibles/ocupacionPct and flags the member's own reservation", async () => {
    const rows = pastRows();
    rows.reservation = [{ class_session_id: "wed1", status: "reservada" }]; // the member holds wed1 (RLS returns only own)
    const semana = await getAgendaSemanaMiembro("2020-06-17", makeFake(rows, (name) =>
      name === "contar_reservas_activas"
        ? { data: [{ session_id: "wed1", activos: 15 }], error: null }
        : { data: [], error: null },
    ));
    const wed = semana.dias[2].sesiones[0];
    const mon = semana.dias[0].sesiones[0];
    expect(wed.disponibles).toBe(wed.capacidad - 15);
    expect(wed.ocupacionPct).toBe(Math.round((15 / wed.capacidad) * 100));
    expect(wed.miReserva).toBe(true);
    expect(mon.miReserva).toBe(false); // not in the reservation set
    expect(mon.disponibles).toBe(mon.capacidad); // absent from the count → 0 active
  });

  it("flags favorita on sessions whose class type is the member's favorite (else false)", async () => {
    const rows = pastRows();
    rows.clientes = [{ favorite_class_type_id: "ct2" }]; // ct2 = Metcon (wed1)
    const semana = await getAgendaSemanaMiembro("2020-06-17", makeFake(rows));
    const wed = semana.dias[2].sesiones[0]; // ct2
    const mon = semana.dias[0].sesiones[0]; // ct1
    expect(wed.favorita).toBe(true);
    expect(mon.favorita).toBe(false);
  });

  it("leaves favorita false for every session when the member has no favorite", async () => {
    const semana = await getAgendaSemanaMiembro("2020-06-17", makeFake(pastRows()));
    expect(semana.dias.flatMap((d) => d.sesiones).every((s) => s.favorita === false)).toBe(true);
  });

  it("carries the class-type sala / nivel / descripción for the booking sheet", async () => {
    const rows = pastRows();
    rows.class_type = [
      { id: "ct1", name: "Fuerza", sala: "Sala Yunque", level: "Intermedio", description: "Barra y fierro." },
      { id: "ct2", name: "Metcon", sala: "Sala Brasa", level: "Alta intensidad", description: "Suda." },
    ];
    const semana = await getAgendaSemanaMiembro("2020-06-17", makeFake(rows));
    const wed = semana.dias[2].sesiones[0];
    expect(wed.sala).toBe("Sala Brasa");
    expect(wed.nivel).toBe("Alta intensidad");
    expect(wed.descripcion).toBe("Suda.");
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

describe("getSaldoMiembro", () => {
  it("reads a finite balance from the member's own cliente row", async () => {
    const saldo = await getSaldoMiembro(makeFake({ clientes: [{ clases_restantes: 7 }] }));
    expect(saldo).toEqual({ ilimitado: false, clasesRestantes: 7 });
  });

  it("reports ilimitado when clases_restantes is null", async () => {
    const saldo = await getSaldoMiembro(makeFake({ clientes: [{ clases_restantes: null }] }));
    expect(saldo).toEqual({ ilimitado: true, clasesRestantes: null });
  });

  it("defaults safely to a zero finite balance when no cliente row exists", async () => {
    const saldo = await getSaldoMiembro(makeFake({ clientes: [] }));
    expect(saldo).toEqual({ ilimitado: false, clasesRestantes: 0 });
  });
});
