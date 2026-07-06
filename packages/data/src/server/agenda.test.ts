import { describe, expect, it } from "vitest";

import { instanteEnZona } from "@gym/format";

import {
  cancelarSesion,
  crearHorarioRecurrente,
  crearSesion,
  editarSesion,
  getAgendaDia,
  getAgendaSemana,
} from "./agenda";
import type { SupabaseServer } from "./supabase";

/**
 * The seam: every Agenda reader/mutation takes an injectable client (ADR-0001), so
 * ORCHESTRATION — the ensure-materialized call before every read, the tz-honest
 * window bounds, the join assembly, the derived-occupancy wiring (PRD #36 decision
 * d — 0 active until Phase 6), and every mutation's Zod + RPC payload — is testable
 * with a hand-rolled fake. No Supabase, no DB. The RPCs themselves (RLS scoping,
 * materialization idempotency) are proven against the real schema elsewhere
 * (supabase/tests/, ADR-0005).
 */

const TZ = "America/Chihuahua"; // UTC-6, DST-free in 2026 (2022 reform)
const LUNES = new Date(2026, 5, 15); // Mon 15 jun 2026
const MIERCOLES = new Date(2026, 5, 17); // Wed 17 jun 2026 (same week) — safely PAST any real
// test-run date (today is 2026-07-05+), so `derivarEstadoSesion` deterministically
// resolves every fixture session here to "termino" regardless of when the suite runs.

function iso(dia: Date, hhmm: string): string {
  return instanteEnZona(dia, hhmm, TZ).toISOString();
}

interface Rows {
  class_session?: Record<string, unknown>[];
  class_type?: Record<string, unknown>[];
  class_session_coach?: Record<string, unknown>[];
  coach?: Record<string, unknown>[];
  gymTimezone?: string;
}

interface RpcCall {
  name: string;
  args: Record<string, unknown>;
}

function makeFake(
  rows: Rows = {},
  opts: {
    sub?: string | null;
    rpc?: (name: string, args: Record<string, unknown>) => { data: unknown; error: unknown };
  } = {},
) {
  const sub = opts.sub === undefined ? "op-1" : opts.sub;
  const rpcCalls: RpcCall[] = [];

  function builder(table: string, list: Record<string, unknown>[]) {
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

  const client = {
    auth: { getClaims: async () => ({ data: sub ? { claims: { sub } } : null }) },
    from: (table: string) => {
      if (table === "gym_membership") return builder(table, [{ gym_id: "gym-1" }]);
      if (table === "gym") return builder(table, [{ id: "gym-1", timezone: rows.gymTimezone ?? TZ }]);
      return builder(table, (rows as Record<string, Record<string, unknown>[]>)[table] ?? []);
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      const result = opts.rpc ? opts.rpc(name, args) : { data: null, error: null };
      return Promise.resolve(result);
    },
  };
  return { client: client as unknown as SupabaseServer, rpcCalls };
}

const ID = (n: string) => `1111111${n}-1111-4111-8111-111111111111`;

describe("getAgendaDia", () => {
  const rowsFor = (): Rows => ({
    class_session: [
      {
        id: "s1",
        class_type_id: "ct1",
        starts_at: iso(MIERCOLES, "09:00"),
        duration_min: 60,
        capacity: 20,
        is_special: false,
        special_name: null,
        room_id: null,
        cancelled_at: null,
      },
      {
        id: "s2",
        class_type_id: "ct2",
        starts_at: iso(MIERCOLES, "18:00"),
        duration_min: 45,
        capacity: 24,
        is_special: true,
        special_name: "Noche especial",
        room_id: null,
        cancelled_at: null,
      },
      {
        // previous local day — must be excluded by the window
        id: "s-prev",
        class_type_id: "ct1",
        starts_at: iso(new Date(2026, 5, 16), "23:00"),
        duration_min: 60,
        capacity: 20,
        is_special: false,
        special_name: null,
        room_id: null,
        cancelled_at: null,
      },
      {
        // next local day — must be excluded by the window
        id: "s-next",
        class_type_id: "ct1",
        starts_at: iso(new Date(2026, 5, 18), "01:00"),
        duration_min: 60,
        capacity: 20,
        is_special: false,
        special_name: null,
        room_id: null,
        cancelled_at: null,
      },
      {
        // same day but cancelled — must be excluded
        id: "s-cancel",
        class_type_id: "ct1",
        starts_at: iso(MIERCOLES, "12:00"),
        duration_min: 60,
        capacity: 20,
        is_special: false,
        special_name: null,
        room_id: null,
        cancelled_at: "2026-06-16T00:00:00Z",
      },
    ],
    class_type: [
      { id: "ct1", name: "Yoga" },
      { id: "ct2", name: "Box" },
    ],
    class_session_coach: [
      { session_id: "s1", coach_id: "co1" },
      { session_id: "s2", coach_id: "co1" },
      { session_id: "s2", coach_id: "co2" },
    ],
    coach: [
      { id: "co1", name: "Marisa" },
      { id: "co2", name: "Paty" },
    ],
  });

  it("returns only the target local day's non-cancelled sessions, windowed in the gym's tz", async () => {
    const { client } = makeFake(rowsFor());
    const dia = await getAgendaDia("2026-06-17", client);
    expect(dia.sesiones.map((s) => s.id)).toEqual(["s1", "s2"]);
  });

  it("joins class_type name and coaches per session", async () => {
    const { client } = makeFake(rowsFor());
    const dia = await getAgendaDia("2026-06-17", client);
    const [s1, s2] = dia.sesiones;
    expect(s1.tipo).toBe("Yoga");
    expect(s1.coaches).toEqual([{ id: "co1", nombre: "Marisa" }]);
    expect(s2.tipo).toBe("Box");
    expect(s2.coaches).toEqual([
      { id: "co1", nombre: "Marisa" },
      { id: "co2", nombre: "Paty" },
    ]);
  });

  it("a session with no coach joins gets an empty coaches array (UI renders 'Por asignar')", async () => {
    const rows = rowsFor();
    rows.class_session_coach = [];
    const { client } = makeFake(rows);
    const dia = await getAgendaDia("2026-06-17", client);
    expect(dia.sesiones.every((s) => s.coaches.length === 0)).toBe(true);
  });

  it("derives the 0-active occupancy projection (PRD decision d): activos 0, disponibles == capacidad", async () => {
    const { client } = makeFake(rowsFor());
    const dia = await getAgendaDia("2026-06-17", client);
    for (const s of dia.sesiones) {
      expect(s.activos).toBe(0);
      expect(s.disponibles).toBe(s.capacidad);
    }
  });

  it("derives estado 'termino' for a past session and wires muestraEspecial from is_special", async () => {
    const { client } = makeFake(rowsFor());
    const dia = await getAgendaDia("2026-06-17", client);
    const [s1, s2] = dia.sesiones;
    expect(s1.estado).toBe("termino");
    expect(s2.estado).toBe("termino");
    expect(s2.esEspecial).toBe(true);
    expect(s2.nombreEspecial).toBe("Noche especial");
    expect(s2.muestraEspecial).toBe(true); // especial AND not a_continuacion
    expect(s1.muestraEspecial).toBe(false); // not especial
  });

  it("resumen counts non-cancelled sessions in-window only", async () => {
    const { client } = makeFake(rowsFor());
    const dia = await getAgendaDia("2026-06-17", client);
    expect(dia.resumen).toEqual({ clases: 2, reservas: 0 });
  });

  it("ensures materialization for the containing week (Monday) exactly once before reading", async () => {
    const { client, rpcCalls } = makeFake(rowsFor());
    await getAgendaDia("2026-06-17", client);
    const calls = rpcCalls.filter((c) => c.name === "ensure_week_materialized");
    expect(calls).toEqual([{ name: "ensure_week_materialized", args: { p_week_start: "2026-06-15" } }]);
  });

  it("returns an empty day cleanly (no sessions)", async () => {
    const { client } = makeFake({ class_session: [], class_type: [], class_session_coach: [], coach: [] });
    const dia = await getAgendaDia("2026-06-17", client);
    expect(dia.sesiones).toEqual([]);
    expect(dia.resumen).toEqual({ clases: 0, reservas: 0 });
  });
});

describe("getAgendaSemana", () => {
  const rowsFor = (): Rows => ({
    class_session: [
      {
        id: "mon1",
        class_type_id: "ct1",
        starts_at: iso(LUNES, "08:00"),
        duration_min: 60,
        capacity: 10,
        is_special: false,
        special_name: null,
        room_id: null,
        cancelled_at: null,
      },
      {
        id: "wed1",
        class_type_id: "ct1",
        starts_at: iso(MIERCOLES, "08:00"),
        duration_min: 60,
        capacity: 10,
        is_special: false,
        special_name: null,
        room_id: null,
        cancelled_at: null,
      },
      {
        // the following Monday — outside the Lun-Sáb window
        id: "next-mon",
        class_type_id: "ct1",
        starts_at: iso(new Date(2026, 5, 22), "08:00"),
        duration_min: 60,
        capacity: 10,
        is_special: false,
        special_name: null,
        room_id: null,
        cancelled_at: null,
      },
    ],
    class_type: [{ id: "ct1", name: "Yoga" }],
    class_session_coach: [],
    coach: [],
  });

  it("groups sessions Lun-Sáb, six day entries, each with only its own day's sessions", async () => {
    const { client } = makeFake(rowsFor());
    const semana = await getAgendaSemana("2026-06-17", client);
    expect(semana.dias).toHaveLength(6);
    expect(semana.dias[0].sesiones.map((s) => s.id)).toEqual(["mon1"]);
    expect(semana.dias[2].sesiones.map((s) => s.id)).toEqual(["wed1"]);
    expect(semana.dias[1].sesiones).toEqual([]); // Tuesday, empty
    // The following Monday's session must never leak into this week's grouping.
    expect(semana.dias.flatMap((d) => d.sesiones.map((s) => s.id))).not.toContain("next-mon");
  });

  it("resolves the week from ANY day passed in (not just Monday)", async () => {
    const { client } = makeFake(rowsFor());
    const semana = await getAgendaSemana("2026-06-17", client); // a Wednesday
    expect([semana.lunes.getFullYear(), semana.lunes.getMonth(), semana.lunes.getDate()]).toEqual([
      2026, 5, 15,
    ]);
  });

  it("ensures materialization for the week exactly once, keyed on the Monday", async () => {
    const { client, rpcCalls } = makeFake(rowsFor());
    await getAgendaSemana("2026-06-17", client);
    const calls = rpcCalls.filter((c) => c.name === "ensure_week_materialized");
    expect(calls).toEqual([{ name: "ensure_week_materialized", args: { p_week_start: "2026-06-15" } }]);
  });

  it("whole-week resumen sums clases/reservas across all sessions in the week", async () => {
    const { client } = makeFake(rowsFor());
    const semana = await getAgendaSemana("2026-06-17", client);
    expect(semana.resumenSemana.clases).toBe(2);
    expect(semana.resumenSemana.reservas).toBe(0);
  });

  it("an empty week (no sessions) resolves cleanly with a zero ratioOcupacion (no div-by-zero)", async () => {
    const { client } = makeFake({ class_session: [], class_type: [], class_session_coach: [], coach: [] });
    const semana = await getAgendaSemana("2026-06-17", client);
    expect(semana.dias.every((d) => d.sesiones.length === 0)).toBe(true);
    expect(semana.resumenSemana.ratioOcupacion).toBe(0);
  });
});

describe("crearSesion — one-off write orchestration (injected fake)", () => {
  const valid = () => ({
    classTypeId: ID("1"),
    fecha: "2026-06-17",
    hora: "18:00",
    duracionMin: 45,
    cupo: 24,
    coachIds: [ID("2")],
  });

  it("resolves fecha+hora through the gym tz and sends the exact create_class_session payload", async () => {
    const { client, rpcCalls } = makeFake(
      {},
      { rpc: () => ({ data: "new-session-id", error: null }) },
    );
    const result = await crearSesion(valid(), client);
    expect(result).toEqual({ ok: true, sesionId: "new-session-id" });
    expect(rpcCalls).toHaveLength(1);
    expect(rpcCalls[0].name).toBe("create_class_session");
    expect(rpcCalls[0].args).toEqual({
      p_class_type_id: ID("1"),
      p_starts_at: iso(MIERCOLES, "18:00"),
      p_duration_min: 45,
      p_capacity: 24,
      p_coach_ids: [ID("2")],
      p_is_special: false,
    });
    expect("p_special_name" in rpcCalls[0].args).toBe(false);
    expect("p_room_id" in rpcCalls[0].args).toBe(false);
  });

  it("evento especial: sends p_special_name, defaulting a blank name to 'Especial'", async () => {
    const { client, rpcCalls } = makeFake({}, { rpc: () => ({ data: "id", error: null }) });
    await crearSesion({ ...valid(), esEspecial: true, nombreEspecial: "  " }, client);
    expect(rpcCalls[0].args.p_special_name).toBe("Especial");
    expect(rpcCalls[0].args.p_is_special).toBe(true);
  });

  it("passes roomId through when provided", async () => {
    const { client, rpcCalls } = makeFake({}, { rpc: () => ({ data: "id", error: null }) });
    await crearSesion({ ...valid(), roomId: ID("3") }, client);
    expect(rpcCalls[0].args.p_room_id).toBe(ID("3"));
  });

  it("surfaces an RPC error as a typed result (no throw)", async () => {
    const { client } = makeFake(
      {},
      { rpc: () => ({ data: null, error: { message: "class_type no pertenece al gimnasio del operador" } }) },
    );
    const result = await crearSesion(valid(), client);
    expect(result).toEqual({ ok: false, error: "class_type no pertenece al gimnasio del operador" });
  });

  it("rejects an invalid hora (zod domain bound) before any RPC call", async () => {
    const { client, rpcCalls } = makeFake({}, { rpc: () => ({ data: "id", error: null }) });
    const result = await crearSesion({ ...valid(), hora: "23:50" }, client);
    expect(result.ok).toBe(false);
    expect(rpcCalls).toHaveLength(0);
  });

  it("rejects an invalid cupo (out of 4-40 bound) before any RPC call", async () => {
    const { client, rpcCalls } = makeFake({}, { rpc: () => ({ data: "id", error: null }) });
    const result = await crearSesion({ ...valid(), cupo: 2 }, client);
    expect(result.ok).toBe(false);
    expect(rpcCalls).toHaveLength(0);
  });

  it("rejects an invalid duracion (not in the fixed set) before any RPC call", async () => {
    const { client, rpcCalls } = makeFake({}, { rpc: () => ({ data: "id", error: null }) });
    const result = await crearSesion({ ...valid(), duracionMin: 40 }, client);
    expect(result.ok).toBe(false);
    expect(rpcCalls).toHaveLength(0);
  });

  it("surfaces 'No autenticado' as a typed result when unauthenticated", async () => {
    const { client, rpcCalls } = makeFake({}, { sub: null });
    const result = await crearSesion(valid(), client);
    expect(result).toEqual({ ok: false, error: "No autenticado" });
    expect(rpcCalls).toHaveLength(0);
  });
});

describe("crearHorarioRecurrente — 'Se repite' write orchestration (injected fake)", () => {
  const valid = () => ({
    classTypeId: ID("1"),
    weekdays: [0, 2, 4],
    hora: "18:00",
    duracionMin: 45,
    cupo: 24,
    coachIds: [ID("2")],
  });

  it("sends the exact create_recurring_schedule payload, omitting p_horizon_weeks when absent", async () => {
    const { client, rpcCalls } = makeFake(
      {},
      { rpc: () => ({ data: ["t1", "t2", "t3"], error: null }) },
    );
    const result = await crearHorarioRecurrente(valid(), client);
    expect(result).toEqual({ ok: true, templateIds: ["t1", "t2", "t3"] });
    expect(rpcCalls[0].name).toBe("create_recurring_schedule");
    expect(rpcCalls[0].args).toEqual({
      p_class_type_id: ID("1"),
      p_weekdays: [0, 2, 4],
      p_start_time: "18:00",
      p_duration_min: 45,
      p_capacity: 24,
      p_coach_ids: [ID("2")],
    });
    expect("p_horizon_weeks" in rpcCalls[0].args).toBe(false);
  });

  it("passes horizonWeeks through when provided", async () => {
    const { client, rpcCalls } = makeFake({}, { rpc: () => ({ data: [], error: null }) });
    await crearHorarioRecurrente({ ...valid(), horizonWeeks: 8 }, client);
    expect(rpcCalls[0].args.p_horizon_weeks).toBe(8);
  });

  it("rejects an empty weekdays array before any RPC call", async () => {
    const { client, rpcCalls } = makeFake({}, { rpc: () => ({ data: [], error: null }) });
    const result = await crearHorarioRecurrente({ ...valid(), weekdays: [] }, client);
    expect(result.ok).toBe(false);
    expect(rpcCalls).toHaveLength(0);
  });

  it("rejects a weekday out of 0-5 range before any RPC call", async () => {
    const { client, rpcCalls } = makeFake({}, { rpc: () => ({ data: [], error: null }) });
    const result = await crearHorarioRecurrente({ ...valid(), weekdays: [6] }, client);
    expect(result.ok).toBe(false);
    expect(rpcCalls).toHaveLength(0);
  });

  it("surfaces an RPC error as a typed result", async () => {
    const { client } = makeFake({}, { rpc: () => ({ data: null, error: { message: "boom" } }) });
    const result = await crearHorarioRecurrente(valid(), client);
    expect(result).toEqual({ ok: false, error: "boom" });
  });
});

describe("editarSesion — write orchestration (injected fake)", () => {
  const valid = () => ({
    sesionId: ID("9"),
    classTypeId: ID("1"),
    fecha: "2026-06-17",
    hora: "19:00",
    duracionMin: 60,
    cupo: 30,
    coachIds: [] as string[],
  });

  it("sends the exact edit_class_session payload (never fans out — single row RPC)", async () => {
    const { client, rpcCalls } = makeFake({}, { rpc: () => ({ data: null, error: null }) });
    const result = await editarSesion(valid(), client);
    expect(result).toEqual({ ok: true });
    expect(rpcCalls[0].name).toBe("edit_class_session");
    expect(rpcCalls[0].args).toEqual({
      p_session_id: ID("9"),
      p_class_type_id: ID("1"),
      p_starts_at: iso(MIERCOLES, "19:00"),
      p_duration_min: 60,
      p_capacity: 30,
      p_coach_ids: [],
      p_is_special: false,
    });
    expect("p_special_name" in rpcCalls[0].args).toBe(false);
  });

  it("surfaces an RPC error (e.g. 'Sesión no encontrada') as a typed result", async () => {
    const { client } = makeFake({}, { rpc: () => ({ data: null, error: { message: "Sesión no encontrada" } }) });
    const result = await editarSesion(valid(), client);
    expect(result).toEqual({ ok: false, error: "Sesión no encontrada" });
  });

  it("rejects a non-uuid sesionId before any RPC call", async () => {
    const { client, rpcCalls } = makeFake({}, { rpc: () => ({ data: null, error: null }) });
    const result = await editarSesion({ ...valid(), sesionId: "nope" }, client);
    expect(result.ok).toBe(false);
    expect(rpcCalls).toHaveLength(0);
  });
});

describe("cancelarSesion — write orchestration (injected fake)", () => {
  it("sends the exact cancel_class_session payload", async () => {
    const { client, rpcCalls } = makeFake({}, { rpc: () => ({ data: null, error: null }) });
    const result = await cancelarSesion({ sesionId: ID("9") }, client);
    expect(result).toEqual({ ok: true });
    expect(rpcCalls).toEqual([{ name: "cancel_class_session", args: { p_session_id: ID("9") } }]);
  });

  it("surfaces an already-cancelled RPC error as a typed result", async () => {
    const { client } = makeFake(
      {},
      { rpc: () => ({ data: null, error: { message: "Sesión no encontrada o ya cancelada" } }) },
    );
    const result = await cancelarSesion({ sesionId: ID("9") }, client);
    expect(result).toEqual({ ok: false, error: "Sesión no encontrada o ya cancelada" });
  });

  it("rejects a non-uuid sesionId before any RPC call", async () => {
    const { client, rpcCalls } = makeFake({}, { rpc: () => ({ data: null, error: null }) });
    const result = await cancelarSesion({ sesionId: "nope" }, client);
    expect(result.ok).toBe(false);
    expect(rpcCalls).toHaveLength(0);
  });
});
