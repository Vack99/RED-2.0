import { describe, expect, it } from "vitest";

import { instanteEnZona } from "@gym/format";

import {
  getClaseDetalleMiembro,
  getConfirmacionReserva,
  toggleFavoritoTipo,
} from "./clase-miembro";
import type { SupabaseServer } from "./supabase";

/**
 * The clase-detail + Confirmada + favorita seam (slice #59). Injectable client (ADR-0001),
 * so the orchestration — the member-gym/tz resolution, the coach/workblock/bring assembly,
 * the derived estado + occupancy, the roster RPC, the favorite comparison, and the
 * "Confirmada is only ever a real booking" guard — is testable against a hand-rolled fake.
 * RLS/RPC denial (anon, cross-gym, no-PII roster) is proven at the DB layer
 * (favorito_rules.sql / roster_clase_rules.sql), not here.
 */

const TZ = "America/Chihuahua";
const FUT = new Date(2099, 5, 17); // Wed 17 jun 2099
function iso(hhmm: string): string {
  return instanteEnZona(FUT, hhmm, TZ).toISOString();
}

interface Rows {
  gym_membership?: Record<string, unknown>[];
  /** Seed multiple gym rows (id/slug/timezone) for host-reconciliation tests; defaults to gym-1. */
  gym?: Record<string, unknown>[];
  class_session?: Record<string, unknown>[];
  class_type?: Record<string, unknown>[];
  class_type_workblock?: Record<string, unknown>[];
  class_type_bring_item?: Record<string, unknown>[];
  class_session_coach?: Record<string, unknown>[];
  coach?: Record<string, unknown>[];
  reservation?: Record<string, unknown>[];
  clientes?: Record<string, unknown>[];
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
              (a[orderCol as string] as number) > (b2[orderCol as string] as number) ? 1 : -1,
            )
          : filtered;
        return resolve({ data: out, error: null });
      },
    };
    return b;
  }

  const membership =
    rows.gym_membership === undefined ? [{ gym_id: "gym-1" }] : rows.gym_membership;

  const gyms = rows.gym ?? [{ id: "gym-1", slug: "gym-1", timezone: TZ }];

  // resolverMiembroGym now reads gym_membership with an embedded `gym(...)` FK join (one
  // request, perf) instead of a separate `gym` query — PostgREST returns that embed as a
  // single object per row (verified against the real stack), so the fake pre-joins here.
  const gymById = new Map(gyms.map((g) => [g.id, g]));
  const membershipWithGym = membership.map((m) => ({ ...m, gym: gymById.get(m.gym_id as string) ?? null }));

  const client = {
    from: (table: string) => {
      if (table === "gym_membership") return builder(membershipWithGym);
      if (table === "gym") return builder(gyms);
      return builder((rows as Record<string, Record<string, unknown>[]>)[table] ?? []);
    },
    rpc: (name: string, args: Record<string, unknown>) =>
      Promise.resolve(rpc ? rpc(name, args) : { data: [], error: null }),
  };
  return client as unknown as SupabaseServer;
}

const SID = "11111111-1111-4111-8111-111111111111";
const CTID = "22222222-2222-4222-8222-222222222222";

function detalleRows(extra: Partial<Rows> = {}): Rows {
  return {
    class_session: [
      { id: SID, class_type_id: CTID, starts_at: iso("18:15"), duration_min: 60, capacity: 20, cancelled_at: null },
    ],
    class_type: [
      { id: CTID, name: "Metcon", sala: "Sala Brasa", level: "Alta intensidad", description: "Suda." },
    ],
    class_type_workblock: [
      { class_type_id: CTID, label: "Calentamiento", sort_order: 0, value: "Movilidad + activación" },
      { class_type_id: CTID, label: "AMRAP", sort_order: 1, value: null },
    ],
    class_type_bring_item: [
      { class_type_id: CTID, label: "Toalla", sort_order: 0 },
      { class_type_id: CTID, label: "Agua", sort_order: 1 },
    ],
    class_session_coach: [{ session_id: SID, coach_id: "co1" }],
    coach: [{ id: "co1", name: "Dani", initials: "DA", specialty: "HIIT", bio: "Energía pura." }],
    ...extra,
  };
}

describe("getClaseDetalleMiembro", () => {
  it("assembles the full detail: type, coaches, workblocks, bring items, estado, occupancy", async () => {
    const fake = makeFake(detalleRows(), (name) =>
      name === "roster_clase"
        ? { data: [{ iniciales: "JP" }, { iniciales: "LM" }], error: null }
        : name === "contar_reservas_activas"
          ? { data: [{ session_id: SID, activos: 2 }], error: null }
          : { data: [], error: null },
    );
    const d = await getClaseDetalleMiembro(SID, fake);
    expect(d).not.toBeNull();
    expect(d!.tipo).toBe("Metcon");
    expect(d!.hora).toBe("18:15");
    expect(d!.horaFin).toBe("19:15");
    expect(d!.fechaLarga).toBe("Miércoles 17 de junio");
    expect(d!.coaches).toEqual([
      { nombre: "Dani", iniciales: "DA", especialidad: "HIIT", bio: "Energía pura." },
    ]);
    expect(d!.bloques).toEqual([
      { etiqueta: "Calentamiento", valor: "Movilidad + activación" },
      { etiqueta: "AMRAP", valor: null },
    ]);
    expect(d!.porTraer).toEqual(["Toalla", "Agua"]);
    expect(d!.estado).toBe("normal"); // future session, not full
    expect(d!.ocupados).toBe(2);
    expect(d!.disponibles).toBe(18);
    expect(d!.roster).toEqual(["JP", "LM"]);
    expect(d!.miReserva).toBe(false);
    expect(d!.favorita).toBe(false);
  });

  it("derives 'lleno' when active reservations reach capacity", async () => {
    const fake = makeFake(detalleRows(), (name) =>
      name === "contar_reservas_activas"
        ? { data: [{ session_id: SID, activos: 20 }], error: null }
        : { data: [], error: null },
    );
    const d = await getClaseDetalleMiembro(SID, fake);
    expect(d!.estado).toBe("lleno");
    expect(d!.disponibles).toBe(0);
  });

  it("flags miReserva + favorita from the member's own rows", async () => {
    const rows = detalleRows({
      reservation: [{ id: "r1", class_session_id: SID, status: "reservada" }],
      clientes: [{ gym_id: "gym-1", favorite_class_type_id: CTID }],
    });
    const d = await getClaseDetalleMiembro(SID, makeFake(rows));
    expect(d!.miReserva).toBe(true);
    expect(d!.favorita).toBe(true);
  });

  it("returns null for a session the member cannot see", async () => {
    expect(await getClaseDetalleMiembro(SID, makeFake({ class_session: [] }))).toBeNull();
  });

  it("returns null for a malformed session id (no DB call)", async () => {
    expect(await getClaseDetalleMiembro("not-a-uuid", makeFake(detalleRows()))).toBeNull();
  });

  it("returns null when the caller has no membership", async () => {
    expect(await getClaseDetalleMiembro(SID, makeFake({ gym_membership: [] }))).toBeNull();
  });
});

describe("getConfirmacionReserva", () => {
  it("returns the ticket for a real active future booking", async () => {
    const rows = detalleRows({
      reservation: [{ id: "r1", class_session_id: SID, status: "reservada" }],
    });
    const c = await getConfirmacionReserva(SID, makeFake(rows));
    expect(c).not.toBeNull();
    expect(c!.tipo).toBe("Metcon");
    expect(c!.coaches).toBe("Dani");
    expect(c!.fechaCorta).toBe("MIÉ 17");
    expect(c!.mesCorto).toBe("JUN");
    expect(c!.hora).toBe("18:15");
    expect(c!.horaFin).toBe("19:15");
  });

  it("returns null (never fallback) when the member holds no active reservation", async () => {
    const c = await getConfirmacionReserva(SID, makeFake(detalleRows()));
    expect(c).toBeNull();
  });

  it("returns null when the booking is cancelled (not reservada)", async () => {
    const rows = detalleRows({
      reservation: [{ id: "r1", class_session_id: SID, status: "cancelada" }],
    });
    expect(await getConfirmacionReserva(SID, makeFake(rows))).toBeNull();
  });
});

/**
 * Host reconciliation (audit #17 / spec §5.5), the clase-miembro twin of resolverMiembroGym.
 * A member in several gyms reads the HOST gym's data on that gym's site. The observable signal
 * is the resolved timezone: the two gyms sit one hour apart (both DST-free), so the SAME UTC
 * session renders a different local `hora` depending on which membership won. Host match wins;
 * no host / no match falls back to the OLDEST membership (stable, deterministic).
 */
describe("getClaseDetalleMiembro — host-tenant reconciliation (audit #17)", () => {
  const dosGimnasios = (): Rows => ({
    ...detalleRows(),
    gym_membership: [
      { gym_id: "gym-cua", created_at: "2020-01-01T00:00:00Z" }, // older → the fallback
      { gym_id: "gym-her", created_at: "2024-01-01T00:00:00Z" },
    ],
    gym: [
      { id: "gym-cua", slug: "cua", timezone: "America/Chihuahua" }, // UTC-6 → 18:15
      { id: "gym-her", slug: "her", timezone: "America/Hermosillo" }, // UTC-7 → 17:15
    ],
  });

  it("host match → renders in the host gym's timezone (Hermosillo, UTC-7)", async () => {
    const d = await getClaseDetalleMiembro(SID, makeFake(dosGimnasios()), "her");
    expect(d!.hora).toBe("17:15");
  });

  it("host match → renders in the host gym's timezone (Chihuahua, UTC-6)", async () => {
    const d = await getClaseDetalleMiembro(SID, makeFake(dosGimnasios()), "cua");
    expect(d!.hora).toBe("18:15");
  });

  it("no host tenant → deterministic fallback to the OLDEST membership's gym (Chihuahua)", async () => {
    const d = await getClaseDetalleMiembro(SID, makeFake(dosGimnasios()), null);
    expect(d!.hora).toBe("18:15");
  });

  it("host names a gym the caller is NOT a member of → same oldest-membership fallback", async () => {
    const d = await getClaseDetalleMiembro(SID, makeFake(dosGimnasios()), "otro");
    expect(d!.hora).toBe("18:15");
  });
});

/**
 * favorita host reconciliation (#74): fetchFavoritoId now reads the host-reconciled gym's clientes
 * row, so a member with rows in several gyms reads THIS gym's favorite — never the `limit(1)` roulette.
 * Each gym favors a different type; only the gym whose row favors the session's type flags favorita.
 */
describe("getClaseDetalleMiembro — favorita host reconciliation (#74)", () => {
  const dosGimnasios = (): Rows => ({
    ...detalleRows(),
    gym_membership: [
      { gym_id: "gym-cua", created_at: "2020-01-01T00:00:00Z" }, // older → the fallback
      { gym_id: "gym-her", created_at: "2024-01-01T00:00:00Z" },
    ],
    gym: [
      { id: "gym-cua", slug: "cua", timezone: TZ },
      { id: "gym-her", slug: "her", timezone: TZ },
    ],
    clientes: [
      { gym_id: "gym-cua", favorite_class_type_id: "otro-tipo" }, // NOT the session's type
      { gym_id: "gym-her", favorite_class_type_id: CTID }, // the session's type
    ],
  });

  it("host match → favorita from the host gym's clientes row (her favors this type → true)", async () => {
    const d = await getClaseDetalleMiembro(SID, makeFake(dosGimnasios()), "her");
    expect(d!.favorita).toBe(true);
  });

  it("host match → false when the host gym's row favors a different type (cua)", async () => {
    const d = await getClaseDetalleMiembro(SID, makeFake(dosGimnasios()), "cua");
    expect(d!.favorita).toBe(false);
  });

  it("no host tenant → oldest-membership fallback (cua favors a different type → false)", async () => {
    const d = await getClaseDetalleMiembro(SID, makeFake(dosGimnasios()), null);
    expect(d!.favorita).toBe(false);
  });
});

describe("toggleFavoritoTipo", () => {
  it("returns the new favorite id from the RPC", async () => {
    const fake = makeFake({}, (name, args) =>
      name === "toggle_favorito_tipo"
        ? { data: [{ favorito: args.p_class_type_id }], error: null }
        : { data: [], error: null },
    );
    expect(await toggleFavoritoTipo(CTID, fake)).toEqual({ ok: true, favorito: CTID });
  });

  it("maps a cleared favorite (null) through", async () => {
    const fake = makeFake({}, () => ({ data: [{ favorito: null }], error: null }));
    expect(await toggleFavoritoTipo(CTID, fake)).toEqual({ ok: true, favorito: null });
  });

  it("rejects a malformed class-type id without calling the RPC", async () => {
    const res = await toggleFavoritoTipo("nope", makeFake());
    expect(res.ok).toBe(false);
  });

  it("surfaces the RPC error message", async () => {
    const fake = makeFake({}, () => ({ data: null, error: { message: "Tipo de clase no encontrado" } }));
    const res = await toggleFavoritoTipo(CTID, fake);
    expect(res).toEqual({ ok: false, error: "Tipo de clase no encontrado" });
  });
});
