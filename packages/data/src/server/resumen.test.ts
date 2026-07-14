import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getResumenMes } from "./resumen";
import { makeFake } from "./supabase-fake.test-helper";

// getResumenMes window-bound contract (spec 2026-07-13 §1.8): ventas.fecha is a
// timestamptz → its lower bound must be an absolute INSTANT resolved in the gym's
// zone; asistencias.fecha is a `date` → its bound stays a bare day string. Same
// column name, two meanings — the asymmetry is deliberate and pinned here. The
// dashboard numbers must not move: the fold re-buckets on gym-local dates, so the
// instant bound only changes WHICH superset is fetched, never what is counted.

// Frozen clock: 2026-07-13T18:00:00Z = 12:00 in Chihuahua (GMT-6) → hoy = 13 jul,
// window start = 1 jun. In Asia/Tokyo (GMT+9) the same instant is already 14 jul.
const AHORA = new Date("2026-07-13T18:00:00.000Z");

// Hand-derived expectations (never recomputed the way the code does):
// ventas — jul: 500 (5 jul) + 250 (12 jul local, 13 jul UTC) = 750 across 2 rows;
// jun prior-month-to-date (day ≤ 13): only 300 (10 jun); 900 (20 jun) excluded.
// semana (7–13 jul): only the 250. asistencias — jul: 13 + 12 = 2; jun (≤13): 1.
const VENTAS = [
  { fecha: "2026-07-06T02:00:00.000Z", monto: 500 }, // 5 jul 20:00 Chihuahua
  { fecha: "2026-07-13T02:00:00.000Z", monto: 250 }, // 12 jul 20:00 Chihuahua
  { fecha: "2026-06-10T18:00:00.000Z", monto: 300 }, // 10 jun
  { fecha: "2026-06-20T18:00:00.000Z", monto: 900 }, // 20 jun — beyond day 13, excluded from prev
];
const ASISTENCIAS = [
  { fecha: "2026-07-13", deleted_at: null },
  { fecha: "2026-07-12", deleted_at: null },
  { fecha: "2026-06-05", deleted_at: null },
];

beforeEach(() => {
  vi.useFakeTimers({ now: AHORA });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("getResumenMes — window bounds", () => {
  it("bounds ventas (timestamptz) by the gym-local INSTANT of the window start, not a bare day string", async () => {
    const { client, gteCalls } = makeFake({ ventas: VENTAS, asistencias: ASISTENCIAS });
    await getResumenMes(client);
    // 1 jun 2026 00:00 in Chihuahua (GMT-6) = 06:00Z.
    expect(gteCalls["ventas"]).toEqual([["fecha", "2026-06-01T06:00:00.000Z"]]);
  });

  it("scopes BOTH reads to the operator's gym (§1.1 — the dashboard is the hottest read; audit 2026-07-13)", async () => {
    const { client, eqCalls } = makeFake({ ventas: VENTAS, asistencias: ASISTENCIAS });
    await getResumenMes(client);
    expect(eqCalls["ventas"]).toContainEqual(["gym_id", "test-gym"]);
    expect(eqCalls["asistencias"]).toContainEqual(["gym_id", "test-gym"]);
  });

  it("bounds asistencias (a `date` column) by the bare day string — the deliberate asymmetry with ventas", async () => {
    const { client, gteCalls } = makeFake({ ventas: VENTAS, asistencias: ASISTENCIAS });
    await getResumenMes(client);
    expect(gteCalls["asistencias"]).toEqual([["fecha", "2026-06-01"]]);
  });

  it("resolves the instant in the gym's own zone: Asia/Tokyo (UTC-positive, where a day-string bound would fetch 9h LATE and drop early-morning ventas)", async () => {
    const { client, gteCalls } = makeFake({ ventas: [], asistencias: [], gymTimezone: "Asia/Tokyo" });
    await getResumenMes(client);
    // In Tokyo the frozen instant is already 14 jul → window start = 1 jun Tokyo = 31 may 15:00Z.
    expect(gteCalls["ventas"]).toEqual([["fecha", "2026-05-31T15:00:00.000Z"]]);
    expect(gteCalls["asistencias"]).toEqual([["fecha", "2026-06-01"]]);
  });
});

describe("getResumenMes — behaviour neutrality (the §1.8 'changes no number' claim)", () => {
  it("computes the exact dashboard numbers the day-string implementation produced", async () => {
    const { client } = makeFake({ ventas: VENTAS, asistencias: ASISTENCIAS });
    const r = await getResumenMes(client);
    expect(r.ingresosMes).toBe(750);
    expect(r.ventasMes).toBe(2);
    expect(r.ingresosMesPrev).toBe(300);
    expect(r.ventasMesPrev).toBe(1);
    expect(r.ingresosSemana).toBe(250);
    expect(r.asistMes).toBe(2);
    expect(r.asistMesPrev).toBe(1);
    expect(r.asistenciasHoy).toBe(1);
    expect(r.asistenciasAyer).toBe(1);
  });

  it("keeps the soft-delete filter on asistencias", async () => {
    const { client, isCalls } = makeFake({ ventas: VENTAS, asistencias: ASISTENCIAS });
    await getResumenMes(client);
    expect(isCalls["asistencias"]).toEqual([["deleted_at", null]]);
  });
});
