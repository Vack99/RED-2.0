import { describe, expect, it } from "vitest";

import { getRespaldoData } from "./respaldo";
import { makeFake } from "./supabase-fake.test-helper";

/**
 * The seam this exercises: `getRespaldoData` takes an injectable client (ADR-0001),
 * so the gather ORCHESTRATION — the four reads, the FULL-history (no date filter)
 * guarantee, the asistencias soft-delete `.is("deleted_at", null)` filter, the
 * created_at → alta mapping, and the PAGINATION of the two full-history ledgers
 * (ventas, asistencias) — is testable with a hand-rolled fake. No Supabase, no DB.
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

describe("getRespaldoData — full-history RLS-scoped gather (injected fake)", () => {
  it("returns all four tables, ventas + asistencias UNFILTERED by date (full history)", async () => {
    // Seed both a recent and a January row in ventas + asistencias. A month-scoped
    // reader would drop January; full history keeps BOTH. This is the load-bearing
    // requirement — the respaldo is the whole record, not the current month.
    const reciente = venta({ folio: 1002, fecha: "2026-05-28T16:00:00.000Z" });
    const enero = venta({ folio: 1000, fecha: "2026-01-05T16:00:00.000Z" });
    const asistReciente = asistencia({ fecha: "2026-05-28" });
    const asistEnero = asistencia({ fecha: "2026-01-05" });

    const { client, gteCalls } = makeFake({
      clientes: [cliente()],
      ventas: [reciente, enero],
      asistencias: [asistReciente, asistEnero],
      paquetes: [paquete()],
    });

    const data = await getRespaldoData(client);

    // All four arrays present and fully populated.
    expect(data.clientes).toHaveLength(1);
    expect(data.paquetes).toHaveLength(1);

    // FULL history: both the recent AND the January rows survive in BOTH ledgers.
    expect(data.ventas.map((v) => v.folio).sort()).toEqual([1000, 1002]);
    expect(data.asistencias.map((a) => a.fecha).sort()).toEqual(["2026-01-05", "2026-05-28"]);

    // And NO `.gte("fecha", ...)` date filter was ever applied to either ledger.
    expect(gteCalls["ventas"]).toEqual([]);
    expect(gteCalls["asistencias"]).toEqual([]);
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
