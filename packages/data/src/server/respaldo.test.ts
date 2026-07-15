import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getMesesRespaldo, getRespaldoData } from "./respaldo";
import { makeFake } from "./supabase-fake.test-helper";

/**
 * The seam this exercises: `getRespaldoData` takes an injectable client (ADR-0001),
 * so the gather ORCHESTRATION — the four reads, the WINDOW BOUNDS (24-month default /
 * single-month + prev span; ADR-0006 as amended 2026-07-13), the asistencias
 * soft-delete `.is("deleted_at", null)` filter, the created_at → alta mapping, the
 * corte fold, and the PAGINATION of the two ledgers — is testable with a hand-rolled
 * fake. No Supabase, no DB.
 *
 * The fake (`makeFake`, the shared chain-capturing builder in
 * `./supabase-fake.test-helper`) is a per-table thenable query builder that
 * resolves to `{ data, error }` and RECORDS its `.is()`/`.gte()`/`.range()` calls so
 * the test can assert the soft-delete filter, the absence of a date filter, and the
 * pagination windows applied at the query (build-spec §0/§5).
 *
 * `.range(from, to)` returns the requested slice of the seeded list, so the
 * paginator's "loop until a short page returns" termination is exercised for real —
 * a single seeded read of `[from, to]` resolves to exactly that window.
 */

// ── Inline fixtures (DB-row shape) with spread overrides (house style) ──

const cliente = (over: Record<string, unknown> = {}) => ({
  id: "cli-1",
  nombre: "Andrea Castro",
  tel: "614 218 3401",
  email: "andrea@example.com",
  birthday: "1995-06-16",
  paquete_nombre: "8 clases",
  clases_restantes: 5,
  vence: "2026-06-20",
  created_at: "2026-01-10T18:30:00.000Z",
  ...over,
});

const venta = (over: Record<string, unknown> = {}) => ({
  folio: 1001,
  fecha: "2026-05-20T16:00:00.000Z",
  created_at: "2026-05-20T16:00:00.000Z",
  cliente_id: "cli-1",
  paquete_nombre: "8 clases",
  monto: 800,
  metodo: "efectivo",
  vigencia_tipo: "dias",
  vigencia_dias: 30,
  ...over,
});

const asistencia = (over: Record<string, unknown> = {}) => ({
  fecha: "2026-05-20",
  hora: "09:15:00",
  cliente_id: "cli-1",
  ...over,
});

const paquete = (over: Record<string, unknown> = {}) => ({
  nombre: "8 clases",
  precio: 800,
  clases: 8,
  vigencia_tipo: "dias",
  vigencia_dias: 30,
  orden: 1,
  ...over,
});

// Frozen clock for the window-bound assertions: 2026-07-13T18:00Z = 12:00 in
// Chihuahua (the fake's default zone) → hoy = 13 jul 2026; the 24-month default
// window (current month + 23 prior) opens at 1 ago 2024.
const AHORA = new Date("2026-07-13T18:00:00.000Z");

describe("getRespaldoData — capped/windowed RLS-scoped gather (injected fake)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: AHORA });
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("default mode windows BOTH ledgers to the last 24 months (ADR-0006 as amended 2026-07-13 — full history is retired)", async () => {
    // This test was the machine-guard on ADR-0006's original "no windowing" clause
    // (it asserted gteCalls === []). The 2026-07-13 amendment retires the unbounded
    // snapshot — the default is the last 24 months — so THIS assertion changes WITH
    // the ADR, deliberately: the guard now pins the 24-month bound instead.
    const reciente = venta({ folio: 1002, fecha: "2026-05-28T16:00:00.000Z" });
    const enero = venta({ folio: 1000, fecha: "2026-01-05T16:00:00.000Z" });

    const { client, gteCalls, ltCalls } = makeFake({
      clientes: [cliente()],
      ventas: [reciente, enero],
      asistencias: [asistencia({ fecha: "2026-05-28" }), asistencia({ fecha: "2026-01-05" })],
      paquetes: [paquete()],
    });

    const data = await getRespaldoData(client);

    expect(data.clientes).toHaveLength(1);
    expect(data.paquetes).toHaveLength(1);
    expect(data.ventas.map((v) => v.folio).sort()).toEqual([1000, 1002]);

    // The deliberate asymmetry (spec §1.8): ventas.fecha is a timestamptz → the
    // bound is the gym-local INSTANT 1 ago 2024 00:00 (06:00Z in Chihuahua);
    // asistencias.fecha is a `date` → a bare day string. No upper bound in default
    // mode (nothing exists after "now").
    expect(gteCalls["ventas"]).toEqual([["fecha", "2024-08-01T06:00:00.000Z"]]);
    expect(gteCalls["asistencias"]).toEqual([["fecha", "2024-08-01"]]);
    expect(ltCalls["ventas"]).toEqual([]);
    expect(ltCalls["asistencias"]).toEqual([]);
    // No Resumen corte in default mode — there is no single month to summarize.
    expect(data.corte).toBeNull();
    expect(data.mes).toBeNull();
  });

  it("month mode (?mes=2026-07) windows ventas on half-open INSTANT bounds and asistencias on half-open DAY bounds — one window spanning the prior month (the resumen.ts precedent) so the corte's prev block has its rows", async () => {
    const { client, gteCalls, ltCalls } = makeFake({
      clientes: [cliente()],
      ventas: [venta()],
      asistencias: [asistencia()],
      paquetes: [paquete()],
    });

    await getRespaldoData(client, "2026-07");

    // Lower bound = 1 jun (prev month start, feeds the prior-month comparison);
    // upper bound = 1 ago (half-open month end). Instants for ventas (timestamptz),
    // bare day strings for asistencias (a `date`) — the §1.8 asymmetry, pinned.
    expect(gteCalls["ventas"]).toEqual([["fecha", "2026-06-01T06:00:00.000Z"]]);
    expect(ltCalls["ventas"]).toEqual([["fecha", "2026-08-01T06:00:00.000Z"]]);
    expect(gteCalls["asistencias"]).toEqual([["fecha", "2026-06-01"]]);
    expect(ltCalls["asistencias"]).toEqual([["fecha", "2026-08-01"]]);
    // clientes stays a FULL roster (it denormalizes cliente_id → nombre; the Altas
    // sheet filters in the pure shaper) and paquetes stays the full catálogo.
    expect(gteCalls["clientes"]).toEqual([]);
    expect(ltCalls["clientes"]).toEqual([]);
    expect(gteCalls["paquetes"]).toEqual([]);
  });

  it("month mode computes the corte from the fetched rows — 3-bucket desglose + the prev block from the spanned prior month (the fold, not the shaper, owns the math)", async () => {
    const { client } = makeFake({
      clientes: [cliente({ created_at: "2026-07-05T18:00:00.000Z" })],
      ventas: [
        venta({ folio: 1, fecha: "2026-07-05T18:00:00.000Z", monto: 500, metodo: "efectivo" }),
        venta({ folio: 2, fecha: "2026-07-10T18:00:00.000Z", monto: 300, metodo: "tarjeta" }),
        venta({ folio: 3, fecha: "2026-06-10T18:00:00.000Z", monto: 900 }), // prev month, day ≤ 13
        venta({ folio: 4, fecha: "2026-06-20T18:00:00.000Z", monto: 111 }), // prev, day 20 > 13 → cut (parcial)
      ],
      asistencias: [asistencia({ fecha: "2026-07-06" }), asistencia({ fecha: "2026-06-02" })],
      paquetes: [paquete()],
    });

    const data = await getRespaldoData(client, "2026-07");

    expect(data.mes).toEqual(new Date(2026, 6, 1));
    expect(data.corte).toMatchObject({
      ingresos: 800,
      ventas: 2,
      ticketPromedio: 400,
      porMetodo: { efectivo: 500, tarjeta: 300, transferencia: 0 },
      altas: 1,
      asistencias: 1,
      parcial: true, // July 2026 IS the frozen "current" month
      prev: { ingresos: 900, ventas: 1, asistencias: 1 }, // like-for-like: cut to day 13
    });
  });

  it("a venta at 23:30 local on the month's LAST day lands in THAT month's corte (the whole reason Part 1 exists)", async () => {
    // 23:30 in Chihuahua on 31 jul = 2026-08-01T05:30Z — a UTC-day-string
    // implementation would push it into August.
    const { client } = makeFake({
      clientes: [cliente()],
      ventas: [venta({ folio: 9, fecha: "2026-08-01T05:30:00.000Z", monto: 250 })],
      asistencias: [],
      paquetes: [paquete()],
    });

    const data = await getRespaldoData(client, "2026-07");

    expect(data.corte?.ingresos).toBe(250);
    expect(data.corte?.ventas).toBe(1);
  });

  it("applies the asistencias soft-delete filter `.is(\"deleted_at\", null)` at the query", async () => {
    const { client, isCalls } = makeFake({
      clientes: [cliente()],
      ventas: [venta()],
      asistencias: [asistencia()],
      paquetes: [paquete()],
    });

    await getRespaldoData(client);

    expect(isCalls["asistencias"]).toContainEqual(["deleted_at", null]);
    // The other ledgers have no deleted_at column → no soft-delete filter on them.
    expect(isCalls["ventas"]).toEqual([]);
    expect(isCalls["clientes"]).toEqual([]);
  });

  it("returns a RespaldoData shape: 4 arrays + generadoHoy instanceof Date", async () => {
    const { client } = makeFake({
      clientes: [cliente()],
      ventas: [venta()],
      asistencias: [asistencia()],
      paquetes: [paquete()],
    });

    const data = await getRespaldoData(client);

    expect(data.generadoHoy).toBeInstanceOf(Date);
    expect(Array.isArray(data.clientes)).toBe(true);
    expect(Array.isArray(data.ventas)).toBe(true);
    expect(Array.isArray(data.asistencias)).toBe(true);
    expect(Array.isArray(data.paquetes)).toBe(true);
  });

  it("tolerates empty tables → empty arrays (data ?? [])", async () => {
    const { client } = makeFake({}); // every table resolves to []

    const data = await getRespaldoData(client);

    expect(data.clientes).toEqual([]);
    expect(data.ventas).toEqual([]);
    expect(data.asistencias).toEqual([]);
    expect(data.paquetes).toEqual([]);
  });

  it("maps each client's created_at → the `alta` field", async () => {
    const { client } = makeFake({
      clientes: [cliente({ created_at: "2025-12-01T05:00:00.000Z" })],
    });

    const data = await getRespaldoData(client);

    expect(data.clientes[0].alta).toBe("2025-12-01T05:00:00.000Z");
  });

  it("scopes ALL FOUR reads to the operator's gym — `.eq(\"gym_id\", …)` is the scope selector (spec §1.1), RLS stays the boundary", async () => {
    const { client, eqCalls } = makeFake({
      clientes: [cliente()],
      ventas: [venta()],
      asistencias: [asistencia()],
      paquetes: [paquete()],
    });

    await getRespaldoData(client);

    // "test-gym" is the fake's membership-resolved gym id — the rows the export
    // stamps the gym's name on are selected by it, which RLS structurally cannot do.
    expect(eqCalls["clientes"]).toContainEqual(["gym_id", "test-gym"]);
    expect(eqCalls["ventas"]).toContainEqual(["gym_id", "test-gym"]);
    expect(eqCalls["asistencias"]).toContainEqual(["gym_id", "test-gym"]);
    expect(eqCalls["paquetes"]).toContainEqual(["gym_id", "test-gym"]);
  });

  it("orders both paginated ledgers with a UNIQUE tiebreaker (spec §1.4 — ties on fecha must not reorder across OFFSET pages)", async () => {
    const { client, orderCalls } = makeFake({
      clientes: [cliente()],
      ventas: [venta()],
      asistencias: [asistencia()],
      paquetes: [paquete()],
    });

    await getRespaldoData(client);

    expect(orderCalls["ventas"]).toEqual(["fecha", "folio"]);
    expect(orderCalls["asistencias"]).toEqual(["fecha", "id"]);
  });

  it("throws on a query error (e.g. ventas)", async () => {
    const { client } = makeFake(
      { clientes: [cliente()], ventas: [venta()], asistencias: [asistencia()], paquetes: [paquete()] },
      { error: { table: "ventas", err: new Error("boom") } },
    );

    await expect(getRespaldoData(client)).rejects.toThrow("boom");
  });

  it("paginates ventas past the PostgREST cap — returns ALL > PAGE rows, no truncation", async () => {
    // Seed 1001 ventas — one past the PAGE (1000) cap. A single unpaginated read
    // would silently drop the 1001st (the oldest, since order is `fecha DESC`).
    const ventas = Array.from({ length: 1001 }, (_, i) => venta({ folio: i }));

    const { client, rangeCalls } = makeFake({
      clientes: [cliente()],
      ventas,
      asistencias: [asistencia()],
      paquetes: [paquete()],
    });

    const data = await getRespaldoData(client);

    // (a) ALL 1001 survive — pagination concatenates the two windows correctly.
    expect(data.ventas).toHaveLength(1001);
    expect(data.ventas.map((v) => v.folio)).toEqual(ventas.map((v) => v.folio));

    // (b) `.range` was called for each window: a full first page [0, 999] then the
    // short second page [1000, 1999] (1 row → loop terminates).
    expect(rangeCalls["ventas"]).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("paginates asistencias past the PostgREST cap — returns ALL > PAGE rows, no truncation", async () => {
    const asistencias = Array.from({ length: 1001 }, (_, i) =>
      asistencia({ cliente_id: `cli-${i}` }),
    );

    const { client, rangeCalls, isCalls } = makeFake({
      clientes: [cliente()],
      ventas: [venta()],
      asistencias,
      paquetes: [paquete()],
    });

    const data = await getRespaldoData(client);

    // ALL 1001 survive across the two pagination windows — no oldest-history loss.
    expect(data.asistencias).toHaveLength(1001);
    expect(data.asistencias.map((a) => a.cliente_id)).toEqual(asistencias.map((a) => a.cliente_id));

    // `.range` called for each window: full [0, 999] then short [1000, 1999].
    expect(rangeCalls["asistencias"]).toEqual([
      [0, 999],
      [1000, 1999],
    ]);

    // Soft-delete filter still applied on every paginated asistencias page.
    expect(isCalls["asistencias"]).toContainEqual(["deleted_at", null]);
  });

  it("stops at a single page when a ledger has exactly PAGE rows (short-page on the 2nd read)", async () => {
    // Exactly PAGE (1000) rows: the first window [0, 999] is FULL (== PAGE), so the
    // paginator must make a second read [1000, 1999] which returns 0 rows (short) to
    // confirm there's no more — proving the loop's termination is length-based.
    const ventas = Array.from({ length: 1000 }, (_, i) => venta({ folio: i }));

    const { client, rangeCalls } = makeFake({ ventas });

    const data = await getRespaldoData(client);

    expect(data.ventas).toHaveLength(1000);
    expect(rangeCalls["ventas"]).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });
});

describe("getMesesRespaldo — the picker's months-with-data list (spec §2.5)", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: AHORA }); // hoy = jul 2026 in Chihuahua
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("expands earliest activity → current month, NEWEST first, via two single-row ordered lookups (never min())", async () => {
    const { client, eqCalls, orderCalls } = makeFake({
      // The fake's maybeSingle returns the FIRST seeded row = the earliest.
      ventas: [venta({ fecha: "2026-05-03T18:00:00.000Z" })],
      clientes: [cliente({ created_at: "2026-04-20T18:00:00.000Z" })],
    });

    const meses = await getMesesRespaldo(client);

    expect(meses.map((m) => m.value)).toEqual(["2026-07", "2026-06", "2026-05", "2026-04"]);
    expect(meses[0].label).toBe("Julio 2026");
    expect(meses[3].label).toBe("Abril 2026");
    // Query contract: gym-scoped, ordered single-row probes (index lookups, not aggregates).
    expect(eqCalls["ventas"]).toContainEqual(["gym_id", "test-gym"]);
    expect(eqCalls["clientes"]).toContainEqual(["gym_id", "test-gym"]);
    expect(orderCalls["ventas"]).toEqual(["fecha"]);
    expect(orderCalls["clientes"]).toEqual(["created_at"]);
  });

  it("a gym with no activity yet gets exactly the current month", async () => {
    const { client } = makeFake({ ventas: [], clientes: [] });
    expect(await getMesesRespaldo(client)).toEqual([{ value: "2026-07", label: "Julio 2026" }]);
  });
});
