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
  gymTimezone?: string;
  marca?: string;
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

  const gyms =
    rows.gym ??
    [{ id: "gym-1", slug: "gym-1", timezone: rows.gymTimezone ?? TZ, brand_name: rows.marca ?? "RED" }];

  const client = {
    from: (table: string) => {
      if (table === "gym_membership") return builder(membership);
      if (table === "gym") return builder(gyms);
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
    expect(saldo).toEqual({ ilimitado: false, clasesRestantes: 7 });
  });

  it("reports ilimitado when clases_restantes is null", async () => {
    const saldo = await getSaldoMiembro(makeFake({ clientes: [{ gym_id: "gym-1", clases_restantes: null }] }));
    expect(saldo).toEqual({ ilimitado: true, clasesRestantes: null });
  });

  it("defaults safely to a zero finite balance when no cliente row exists", async () => {
    const saldo = await getSaldoMiembro(makeFake({ clientes: [] }));
    expect(saldo).toEqual({ ilimitado: false, clasesRestantes: 0 });
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

  it("returns a safe empty default (never throws) when the caller has no membership yet (audit #10/#15)", async () => {
    const perfil = await getPerfilResumenMiembro(makeFake({ gym_membership: [] }));
    expect(perfil).toEqual({
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
    clientes: [],
    reservation: [],
  });

  it("host match → the membership in the host gym (newer of the two)", async () => {
    const perfil = await getPerfilResumenMiembro(makeFake(dosGimnasios()), "red");
    expect(perfil.marca).toBe("RED");
  });

  it("host match → the membership in the host gym (older of the two, not just newest)", async () => {
    const perfil = await getPerfilResumenMiembro(makeFake(dosGimnasios()), "forge");
    expect(perfil.marca).toBe("Forge");
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
    expect(await getSaldoMiembro(makeFake(dosGimnasios()), "red")).toEqual({ ilimitado: false, clasesRestantes: 8 });
  });

  it("host match → the other gym's row when that gym is the host (forge → 3)", async () => {
    expect(await getSaldoMiembro(makeFake(dosGimnasios()), "forge")).toEqual({ ilimitado: false, clasesRestantes: 3 });
  });

  it("no host tenant → deterministic fallback to the OLDEST membership's row (forge → 3)", async () => {
    expect(await getSaldoMiembro(makeFake(dosGimnasios()), null)).toEqual({ ilimitado: false, clasesRestantes: 3 });
  });

  it("host names a gym the caller is NOT a member of → same oldest-membership fallback (forge → 3)", async () => {
    expect(await getSaldoMiembro(makeFake(dosGimnasios()), "otro-gym")).toEqual({ ilimitado: false, clasesRestantes: 3 });
  });
});

/**
 * favorita host reconciliation (#74) through the agenda's favorita flag: fetchFavoritoId now reads
 * the host-reconciled gym's clientes row. Each gym favors a DIFFERENT class type, so the flag on a
 * given session flips with the resolved gym. Host match wins; no host / no match → OLDEST membership.
 */
describe("getAgendaSemanaMiembro — favorita host reconciliation (#74)", () => {
  const dosGimnasios = (): Rows => ({
    ...pastRows(),
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
  });

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
