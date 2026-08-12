import { describe, expect, it } from "vitest";

import { instanteEnZona } from "@gym/format";

import {
  getAgendaSemanaMiembro,
  getEsMiembro,
  getPerfilResumenMiembro,
  getSaldoMiembro,
} from "./agenda-miembro";
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
  /** Seed multiple gym rows (id/slug/timezone/brand_name) for host-reconciliation tests;
   *  defaults to a single gym-1 row honoring gymTimezone/marca. */
  gym?: Record<string, unknown>[];
  class_session?: Record<string, unknown>[];
  class_type?: Record<string, unknown>[];
  class_session_coach?: Record<string, unknown>[];
  coach?: Record<string, unknown>[];
  reservation?: Record<string, unknown>[];
  clientes?: Record<string, unknown>[];
  /** The gym's package catalog — the pase-suelto leg `fetchMembresia` reads alongside
   *  `mi_membresia()` so the plan card's veredicto classifies a drop-in the same way the
   *  admin roster does. Defaults to an empty catalog (this gym sells no drop-in). */
  paquetes?: Record<string, unknown>[];
  gymTimezone?: string;
  marca?: string;
}

function makeFake(
  rows: Rows = {},
  rpc?: (name: string, args: Record<string, unknown>) => { data: unknown; error: unknown },
  // Tables whose reads resolve with a transient error (data:null + error set) — lets the
  // restored per-consumer error contracts on the shared clientes read be pinned.
  errorTables: string[] = [],
) {
  function builder(list: Record<string, unknown>[], erroring = false) {
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
      maybeSingle: async () =>
        erroring ? { data: null, error: { message: "transient" } } : { data: filtered[0] ?? null, error: null },
      then: (resolve: (v: { data: unknown[] | null; error: unknown }) => unknown) => {
        if (erroring) return resolve({ data: null, error: { message: "transient" } });
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

  const gyms =
    rows.gym ??
    [{ id: "gym-1", slug: "gym-1", timezone: rows.gymTimezone ?? TZ, brand_name: rows.marca ?? "RED" }];

  // resolverMiembroGym now reads gym_membership with an embedded `gym(...)` FK join (one
  // request, perf) instead of a separate `gym` query — PostgREST returns that embed as a
  // single object per row (verified against the real stack), so the fake pre-joins here.
  const gymById = new Map(gyms.map((g) => [g.id, g]));
  const membershipWithGym = membership.map((m) => ({ ...m, gym: gymById.get(m.gym_id as string) ?? null }));

  // fetchProximasReservas now reads reservation with an embedded `class_session(...)` FK join
  // (one request, perf) instead of a separate class_session query — same embed-shape convention
  // as gym_membership → gym above, so the fake pre-joins here too.
  const sesionesById = new Map((rows.class_session ?? []).map((s) => [s.id as string, s]));
  const reservationWithSesion = (rows.reservation ?? []).map((r) => ({
    ...r,
    class_session: sesionesById.get(r.class_session_id as string) ?? null,
  }));

  const client = {
    from: (table: string) => {
      const erroring = errorTables.includes(table);
      if (table === "gym_membership") return builder(membershipWithGym, erroring);
      if (table === "gym") return builder(gyms, erroring);
      if (table === "reservation") return builder(reservationWithSesion, erroring);
      return builder((rows as Record<string, Record<string, unknown>[]>)[table] ?? [], erroring);
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
      gym_id: "gym-1",
    },
    {
      id: "wed1",
      class_type_id: "ct2",
      starts_at: iso(MIERCOLES_PASADO, "18:15"),
      duration_min: 60,
      capacity: 20,
      cancelled_at: null,
      gym_id: "gym-1",
    },
    {
      // previous week — must be excluded from this Lun-Sáb window
      id: "prev",
      class_type_id: "ct1",
      starts_at: iso(new Date(2020, 5, 8), "08:00"),
      duration_min: 45,
      capacity: 24,
      cancelled_at: null,
      gym_id: "gym-1",
    },
    {
      // cancelled — excluded
      id: "cancel",
      class_type_id: "ct1",
      starts_at: iso(MIERCOLES_PASADO, "12:00"),
      duration_min: 45,
      capacity: 24,
      cancelled_at: "2020-06-16T00:00:00Z",
      gym_id: "gym-1",
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

  it("#220: excludes a session belonging to a different gym even though it's in-window (explicit filter, not RLS alone)", async () => {
    const rows = pastRows();
    rows.class_session!.push({
      id: "otro-gym",
      class_type_id: "ct1",
      starts_at: iso(MIERCOLES_PASADO, "10:00"),
      duration_min: 45,
      capacity: 24,
      cancelled_at: null,
      gym_id: "gym-2",
    });
    const semana = await getAgendaSemanaMiembro("2020-06-17", makeFake(rows));
    const allIds = semana.dias.flatMap((d) => d.sesiones.map((s) => s.id));
    expect(allIds).not.toContain("otro-gym");
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
      name === "contar_reservas_activas_miembro"
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

  // Owner ruling 2026-08-03: a staff walk-in mark inflates `contar_reservas_activas` (the
  // staff/roster seam — walk-ins included, 20260706170000), but must never drive a MEMBER's
  // view of a session to LLENO. This proves the wiring: even when the OLD, walk-in-inclusive
  // seam would report the session at capacity, the member reader's estado/disponibles follow
  // the member-only `contar_reservas_activas_miembro` seam instead. Uses a FUTURE, non-first
  // session (f2) so the estado ladder actually reaches the lleno check — a past session is
  // always "termino" and a day's first session is always "a_continuacion" regardless of activos.
  it("a staff walk-in mark never flips the member-facing estado to lleno (owner ruling 2026-08-03)", async () => {
    const rows: Rows = {
      class_session: [
        { id: "f1", class_type_id: "ct1", starts_at: iso(LUNES_FUTURO, "06:15"), duration_min: 45, capacity: 24, cancelled_at: null, gym_id: "gym-1" },
        { id: "f2", class_type_id: "ct1", starts_at: iso(LUNES_FUTURO, "18:15"), duration_min: 45, capacity: 10, cancelled_at: null, gym_id: "gym-1" },
      ],
      class_type: [{ id: "ct1", name: "Fuerza" }],
      class_session_coach: [],
      coach: [],
    };
    const semana = await getAgendaSemanaMiembro("2099-06-15", makeFake(rows, (name) => {
      if (name === "contar_reservas_activas") {
        // The staff/roster count — walk-ins included — reads as FULL (would-be LLENO).
        return { data: [{ session_id: "f2", activos: 10 }], error: null };
      }
      if (name === "contar_reservas_activas_miembro") {
        // The member-only count — walk-ins excluded — reads well under capacity.
        return { data: [{ session_id: "f2", activos: 2 }], error: null };
      }
      return { data: [], error: null };
    }));
    const f2 = semana.dias[0].sesiones[1];
    expect(f2.estado).not.toBe("lleno");
    expect(f2.disponibles).toBe(f2.capacidad - 2);
  });

  it("flags favorita on sessions whose class type is the member's favorite (else false)", async () => {
    const rows = pastRows();
    rows.clientes = [{ gym_id: "gym-1", favorite_class_type_id: "ct2" }]; // ct2 = Metcon (wed1)
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

  it("swallows a transient clientes read error for the favorita flag (best-effort — no throw, favorita false)", async () => {
    const rows = pastRows();
    rows.clientes = [{ gym_id: "gym-1", favorite_class_type_id: "ct2" }];
    const semana = await getAgendaSemanaMiembro("2020-06-17", makeFake(rows, undefined, ["clientes"]));
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
          gym_id: "gym-1",
        },
        {
          id: "f2",
          class_type_id: "ct1",
          starts_at: iso(LUNES_FUTURO, "18:15"),
          duration_min: 45,
          capacity: 24,
          cancelled_at: null,
          gym_id: "gym-1",
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

  it("returns an empty week (never throws) when the caller has no membership yet (audit #10/#15)", async () => {
    const semana = await getAgendaSemanaMiembro("2020-06-17", makeFake({ gym_membership: [] }));
    expect(semana).toEqual({ dias: [] });
  });
});

describe("getEsMiembro", () => {
  it("is true when the caller holds a gym_membership row", async () => {
    expect(await getEsMiembro(makeFake({ gym_membership: [{ gym_id: "gym-1" }] }))).toBe(true);
  });

  it("is false when the caller holds no gym_membership row (signed in, not yet a member)", async () => {
    expect(await getEsMiembro(makeFake({ gym_membership: [] }))).toBe(false);
  });
});

describe("getSaldoMiembro", () => {
  it("reads a finite balance from the member's own cliente row", async () => {
    const saldo = await getSaldoMiembro(makeFake({ clientes: [{ gym_id: "gym-1", clases_restantes: 7 }] }));
    expect(saldo).toEqual({ ilimitado: false, clasesRestantes: 7, vencido: false });
  });

  it("reports ilimitado when clases_restantes is null", async () => {
    const saldo = await getSaldoMiembro(makeFake({ clientes: [{ gym_id: "gym-1", clases_restantes: null }] }));
    expect(saldo).toEqual({ ilimitado: true, clasesRestantes: null, vencido: false });
  });

  it("defaults safely to a zero finite balance when no cliente row exists", async () => {
    const saldo = await getSaldoMiembro(makeFake({ clientes: [] }));
    expect(saldo).toEqual({ ilimitado: false, clasesRestantes: 0, vencido: false });
  });

  it("flags vencido when vence is in the past — mirrors the reservar_clase gate (#118 E4)", async () => {
    const saldo = await getSaldoMiembro(makeFake({ clientes: [{ gym_id: "gym-1", clases_restantes: 7, vence: "2020-01-01" }] }));
    expect(saldo).toEqual({ ilimitado: false, clasesRestantes: 7, vencido: true });
  });

  it("flags vencido for an expired ILIMITADO too (the server blocks ∞ on a lapsed vigencia)", async () => {
    const saldo = await getSaldoMiembro(makeFake({ clientes: [{ gym_id: "gym-1", clases_restantes: null, vence: "2020-01-01" }] }));
    expect(saldo).toEqual({ ilimitado: true, clasesRestantes: null, vencido: true });
  });

  it("PROPAGATES a transient clientes read error (the balance is load-bearing, never a silent 0)", async () => {
    await expect(
      getSaldoMiembro(makeFake({ clientes: [{ gym_id: "gym-1", clases_restantes: 7 }] }, undefined, ["clientes"])),
    ).rejects.toThrow();
  });
});

describe("getPerfilResumenMiembro", () => {
  it("formats 'miembro desde' in the gym tz and surfaces the notifications preference + marca", async () => {
    const perfil = await getPerfilResumenMiembro(
      makeFake({
        clientes: [{ gym_id: "gym-1", created_at: iso(new Date(2024, 2, 10), "12:00"), notificaciones_activadas: true }],
        marca: "RED",
        reservation: [],
      }),
    );
    expect(perfil.desde).toBe("marzo 2024");
    expect(perfil.notificaciones).toBe(true);
    expect(perfil.marca).toBe("RED");
    expect(perfil.reservas).toEqual([]);
  });

  it("surfaces the member's own nombre from their clientes row (#177 — never auth metadata)", async () => {
    const perfil = await getPerfilResumenMiembro(
      makeFake({ clientes: [{ gym_id: "gym-1", nombre: "Ana Torres" }], reservation: [] }),
    );
    expect(perfil.nombre).toBe("Ana Torres");
  });

  it("defaults nombre to empty string when no cliente row exists yet", async () => {
    const perfil = await getPerfilResumenMiembro(makeFake({ clientes: [], reservation: [] }));
    expect(perfil.nombre).toBe("");
  });

  it("passes a disabled notifications preference through", async () => {
    const perfil = await getPerfilResumenMiembro(
      makeFake({ clientes: [{ gym_id: "gym-1", created_at: null, notificaciones_activadas: false }], reservation: [] }),
    );
    expect(perfil.notificaciones).toBe(false);
    expect(perfil.desde).toBeNull();
  });

  it("defaults the preference to opted-in when no cliente row exists", async () => {
    const perfil = await getPerfilResumenMiembro(makeFake({ clientes: [], reservation: [] }));
    expect(perfil.notificaciones).toBe(true);
    expect(perfil.desde).toBeNull();
  });

  it("reads the gym's paquetes catalog alongside mi_membresia — the plan card's veredicto classifies a drop-in exactly as the admin roster does", async () => {
    const visto: string[] = [];
    await getPerfilResumenMiembro(
      makeFake({ clientes: [], reservation: [], paquetes: [{ nombre: "1 clase", clases: 1 }] }, (name) => {
        visto.push(name);
        return { data: [], error: null };
      }),
    );
    expect(visto).toContain("mi_membresia");
  });

  it("FAILS LOUD on a paquetes read error — a swallowed catalog would misclassify every drop-in (the getPaseSueltoNombres posture, #225 F5)", async () => {
    await expect(
      getPerfilResumenMiembro(
        makeFake({ clientes: [], reservation: [] }, undefined, ["paquetes"]),
      ),
    ).rejects.toMatchObject({ message: "transient" });
  });

  it("is best-effort on a transient clientes read error — degrades to no-date / opted-in, never throws", async () => {
    const perfil = await getPerfilResumenMiembro(
      makeFake(
        { clientes: [{ gym_id: "gym-1", created_at: iso(new Date(2024, 2, 10), "12:00"), notificaciones_activadas: false }], reservation: [] },
        undefined,
        ["clientes"],
      ),
    );
    expect(perfil.desde).toBeNull();
    expect(perfil.notificaciones).toBe(true);
  });

  it("returns a safe empty default (never throws) when the caller has no membership yet (audit #10/#15)", async () => {
    const perfil = await getPerfilResumenMiembro(makeFake({ gym_membership: [] }));
    expect(perfil).toEqual({
      nombre: "",
      desde: null,
      reservas: [],
      notificaciones: true,
      marca: "",
      membresia: null,
      planes: [],
    });
  });
});

/**
 * fetchProximasReservas (perf): reservation → class_session is now ONE embedded-join request
 * instead of a reservation-then-session pair, so the cancelled / not-yet-started filter and the
 * soonest-first sort moved from DB predicates into JS over the embedded rows. These pin that the
 * moved logic still behaves exactly like the old DB-side filters.
 */
describe("getPerfilResumenMiembro — reservas (fetchProximasReservas embedded join)", () => {
  const rows = (): Rows => ({
    class_session: [
      { id: "prox2", class_type_id: "ct1", starts_at: iso(LUNES_FUTURO, "06:15"), duration_min: 45, cancelled_at: null },
      { id: "prox1", class_type_id: "ct2", starts_at: iso(LUNES_FUTURO, "18:15"), duration_min: 60, cancelled_at: null },
      {
        id: "cancelada",
        class_type_id: "ct1",
        starts_at: iso(LUNES_FUTURO, "09:00"),
        duration_min: 45,
        cancelled_at: "2026-01-01T00:00:00Z",
      },
      { id: "pasada", class_type_id: "ct1", starts_at: iso(LUNES_PASADO, "06:15"), duration_min: 45, cancelled_at: null },
    ],
    class_type: [
      { id: "ct1", name: "Fuerza", sala: "Sala Yunque" },
      { id: "ct2", name: "Metcon", sala: "Sala Brasa" },
    ],
    reservation: [
      { class_session_id: "prox1", status: "reservada", gym_id: "gym-1" },
      { class_session_id: "prox1", status: "reservada", gym_id: "gym-1" }, // duplicate — the dedupe guard
      { class_session_id: "prox2", status: "reservada", gym_id: "gym-1" },
      { class_session_id: "cancelada", status: "reservada", gym_id: "gym-1" },
      { class_session_id: "pasada", status: "reservada", gym_id: "gym-1" },
    ],
    clientes: [],
  });

  it("excludes a cancelled session and an already-started session, dedupes, and sorts soonest first", async () => {
    const perfil = await getPerfilResumenMiembro(makeFake(rows()));
    expect(perfil.reservas.map((r) => r.sessionId)).toEqual(["prox2", "prox1"]);
  });

  it("formats the returned booking (tipo, sala, hora) from the embedded class_session", async () => {
    const perfil = await getPerfilResumenMiembro(makeFake(rows()));
    const prox1 = perfil.reservas.find((r) => r.sessionId === "prox1");
    expect(prox1?.tipo).toBe("Metcon");
    expect(prox1?.sala).toBe("Sala Brasa");
    expect(prox1?.hora).toBe("18:15");
  });

  it("#220: excludes a reservation belonging to a different gym (a two-gym member's own bookings don't mix)", async () => {
    const r = rows();
    r.class_session!.push({ id: "otro-gym-sesion", class_type_id: "ct1", starts_at: iso(LUNES_FUTURO, "07:00"), duration_min: 45, cancelled_at: null });
    r.reservation!.push({ class_session_id: "otro-gym-sesion", status: "reservada", gym_id: "gym-2" });
    const perfil = await getPerfilResumenMiembro(makeFake(r));
    expect(perfil.reservas.map((x) => x.sessionId)).not.toContain("otro-gym-sesion");
  });
});

/**
 * Host reconciliation (audit #17 / spec §5.5): a member who belongs to several gyms must read
 * the HOST gym's data on that gym's site — not an arbitrary `limit(1)` row. `resolverMiembroGym`
 * (exercised here through getPerfilResumenMiembro, whose `marca` reports the chosen gym) prefers
 * the membership whose gym matches the host tenant (x-gym slug), and falls back to the OLDEST
 * membership (stable) when there is no host or no match. Host is presentation-only (ADR-0008): it
 * only picks among the caller's OWN memberships — the fake seeds exactly the memberships RLS would.
 */
describe("getPerfilResumenMiembro — host-tenant reconciliation (audit #17)", () => {
  // Two gyms the caller belongs to; forge is the OLDER membership (the deterministic fallback).
  const dosGimnasios = (): Rows => ({
    gym_membership: [
      { gym_id: "gym-forge", created_at: "2020-01-01T00:00:00Z" },
      { gym_id: "gym-red", created_at: "2024-01-01T00:00:00Z" },
    ],
    gym: [
      { id: "gym-forge", slug: "forge", timezone: TZ, brand_name: "Forge" },
      { id: "gym-red", slug: "red", timezone: TZ, brand_name: "RED" },
    ],
    // Distinct nombre per gym (#177): a multi-gym member's own clientes row differs by gym,
    // so the reconciled read must follow the SAME host match as marca — never a limit(1) pick.
    clientes: [
      { gym_id: "gym-forge", nombre: "Ana en Forge" },
      { gym_id: "gym-red", nombre: "Ana en RED" },
    ],
    reservation: [],
  });

  it("host match → the membership in the host gym (newer of the two)", async () => {
    const perfil = await getPerfilResumenMiembro(makeFake(dosGimnasios()), "red");
    expect(perfil.marca).toBe("RED");
    expect(perfil.nombre).toBe("Ana en RED");
  });

  it("host match → the membership in the host gym (older of the two, not just newest)", async () => {
    const perfil = await getPerfilResumenMiembro(makeFake(dosGimnasios()), "forge");
    expect(perfil.marca).toBe("Forge");
    expect(perfil.nombre).toBe("Ana en Forge");
  });

  it("no host tenant (unmapped) → deterministic fallback to the OLDEST membership", async () => {
    const perfil = await getPerfilResumenMiembro(makeFake(dosGimnasios()), null);
    expect(perfil.marca).toBe("Forge");
  });

  it("host names a gym the caller is NOT a member of → same oldest-membership fallback", async () => {
    const perfil = await getPerfilResumenMiembro(makeFake(dosGimnasios()), "otro-gym");
    expect(perfil.marca).toBe("Forge");
  });

  it("single membership → that gym regardless of host (match or not)", async () => {
    const uno = (): Rows => ({
      gym_membership: [{ gym_id: "gym-red", created_at: "2024-01-01T00:00:00Z" }],
      gym: [{ id: "gym-red", slug: "red", timezone: TZ, brand_name: "RED" }],
      clientes: [],
      reservation: [],
    });
    expect((await getPerfilResumenMiembro(makeFake(uno()), "red")).marca).toBe("RED");
    expect((await getPerfilResumenMiembro(makeFake(uno()), "un-host-cualquiera")).marca).toBe("RED");
  });

  /**
   * #219: `mi_membresia()` used to pick its own tenant with a bare `limit 1` and no `order by`, so
   * the DTO could carry gym B's balance/expiry beside gym A's `marca` and `tz`. It now takes the gym
   * — and it must be the SAME one the rest of this DTO resolved, or the split is back.
   */
  it("hands mi_membresia the same gym the DTO's marca/tz came from", async () => {
    const visto: { gym?: unknown } = {};
    const espia = (host: string | null) =>
      getPerfilResumenMiembro(
        makeFake(dosGimnasios(), (name, args) => {
          if (name === "mi_membresia") visto.gym = args.p_gym_id;
          return { data: [], error: null };
        }),
        host,
      );

    expect((await espia("red")).marca).toBe("RED");
    expect(visto.gym).toBe("gym-red");
    expect((await espia("forge")).marca).toBe("Forge");
    expect(visto.gym).toBe("gym-forge");
    expect((await espia(null)).marca).toBe("Forge"); // oldest-membership fallback, never a roulette
    expect(visto.gym).toBe("gym-forge");
  });
});

/**
 * getSaldoMiembro host reconciliation (#74): a member with clientes rows in several gyms must read
 * the balance of the SAME gym the agenda resolves — not the `limit(1)` roulette. The two gyms hold
 * different balances; the host tenant (x-gym) picks its own, else the OLDEST membership (deterministic).
 */
describe("getSaldoMiembro — host-tenant reconciliation (#74)", () => {
  const dosGimnasios = (): Rows => ({
    gym_membership: [
      { gym_id: "gym-forge", created_at: "2020-01-01T00:00:00Z" }, // older → the fallback
      { gym_id: "gym-red", created_at: "2024-01-01T00:00:00Z" },
    ],
    gym: [
      { id: "gym-forge", slug: "forge", timezone: TZ, brand_name: "Forge" },
      { id: "gym-red", slug: "red", timezone: TZ, brand_name: "RED" },
    ],
    clientes: [
      { gym_id: "gym-forge", clases_restantes: 3 },
      { gym_id: "gym-red", clases_restantes: 8 },
    ],
  });

  it("host match → the balance of the host gym's clientes row (red → 8)", async () => {
    expect(await getSaldoMiembro(makeFake(dosGimnasios()), "red")).toEqual({ ilimitado: false, clasesRestantes: 8, vencido: false });
  });

  it("host match → the other gym's row when that gym is the host (forge → 3)", async () => {
    expect(await getSaldoMiembro(makeFake(dosGimnasios()), "forge")).toEqual({ ilimitado: false, clasesRestantes: 3, vencido: false });
  });

  it("no host tenant → deterministic fallback to the OLDEST membership's row (forge → 3)", async () => {
    expect(await getSaldoMiembro(makeFake(dosGimnasios()), null)).toEqual({ ilimitado: false, clasesRestantes: 3, vencido: false });
  });

  it("host names a gym the caller is NOT a member of → same oldest-membership fallback (forge → 3)", async () => {
    expect(await getSaldoMiembro(makeFake(dosGimnasios()), "otro-gym")).toEqual({ ilimitado: false, clasesRestantes: 3, vencido: false });
  });
});

/**
 * favorita host reconciliation (#74) through the agenda's favorita flag: fetchFavoritoId now reads
 * the host-reconciled gym's clientes row. Each gym favors a DIFFERENT class type, so the flag on a
 * given session flips with the resolved gym. Host match wins; no host / no match → OLDEST membership.
 */
describe("getAgendaSemanaMiembro — favorita host reconciliation (#74)", () => {
  // #220 added an explicit `.eq("gym_id", …)` filter to the session read, so the SAME
  // calendar can no longer be shared verbatim across both gyms (as it could when RLS was
  // the only gate) — each gym gets its own gym_id-tagged copy of the fixture sessions.
  const dosGimnasios = (): Rows => {
    const base = pastRows().class_session!;
    return {
      ...pastRows(),
      class_session: [
        ...base.map((s) => ({ ...s, gym_id: "gym-forge" })),
        ...base.map((s) => ({ ...s, id: `${s.id as string}-red`, gym_id: "gym-red" })),
      ],
      gym_membership: [
        { gym_id: "gym-forge", created_at: "2020-01-01T00:00:00Z" }, // older → the fallback
        { gym_id: "gym-red", created_at: "2024-01-01T00:00:00Z" },
      ],
      gym: [
        { id: "gym-forge", slug: "forge", timezone: TZ, brand_name: "Forge" },
        { id: "gym-red", slug: "red", timezone: TZ, brand_name: "RED" },
      ],
      clientes: [
        { gym_id: "gym-forge", favorite_class_type_id: "ct1" }, // Fuerza → mon1
        { gym_id: "gym-red", favorite_class_type_id: "ct2" }, // Metcon → wed1
      ],
    };
  };

  it("host match → favorita follows the host gym's favorite (red → Metcon/wed1)", async () => {
    const semana = await getAgendaSemanaMiembro("2020-06-17", makeFake(dosGimnasios()), "red");
    expect(semana.dias[2].sesiones[0].favorita).toBe(true); // wed1 = ct2
    expect(semana.dias[0].sesiones[0].favorita).toBe(false); // mon1 = ct1
  });

  it("host match → the other gym's favorite when that gym is the host (forge → Fuerza/mon1)", async () => {
    const semana = await getAgendaSemanaMiembro("2020-06-17", makeFake(dosGimnasios()), "forge");
    expect(semana.dias[0].sesiones[0].favorita).toBe(true); // mon1 = ct1
    expect(semana.dias[2].sesiones[0].favorita).toBe(false); // wed1 = ct2
  });

  it("no host tenant → deterministic fallback to the OLDEST membership's favorite (forge → Fuerza)", async () => {
    const semana = await getAgendaSemanaMiembro("2020-06-17", makeFake(dosGimnasios()), null);
    expect(semana.dias[0].sesiones[0].favorita).toBe(true); // forge → ct1
    expect(semana.dias[2].sesiones[0].favorita).toBe(false);
  });
});
