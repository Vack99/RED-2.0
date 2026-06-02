import { describe, expect, it } from "vitest";

import { getRespaldoData } from "./respaldo";
import type { SupabaseServer } from "@/lib/supabase/server";

/**
 * The seam this exercises: `getRespaldoData` takes an injectable client (ADR-0001),
 * so the gather ORCHESTRATION — the four reads, the FULL-history (no date filter)
 * guarantee, the asistencias soft-delete `.is("deleted_at", null)` filter, and the
 * created_at → alta mapping — is testable with a hand-rolled fake. No Supabase, no DB.
 *
 * The fake is a per-table thenable query builder (mirrors ventas.test.ts) that
 * resolves to `{ data, error }` and RECORDS its `.is()` calls so the test can assert
 * the soft-delete filter is applied at the query (build-spec §0/§5).
 */

interface FakeRows {
  clientes?: unknown[];
  ventas?: unknown[];
  asistencias?: unknown[];
  paquetes?: unknown[];
}

interface FakeClient {
  client: SupabaseServer;
  /** Per-table record of `.is(col, val)` calls — the soft-delete assertion target. */
  isCalls: Record<string, [string, unknown][]>;
  /** Per-table record of `.gte(col, val)` calls — proves NO date filter is applied. */
  gteCalls: Record<string, [string, unknown][]>;
}

function makeFake(rows: FakeRows, opts: { error?: { table: string; err: unknown } } = {}): FakeClient {
  const isCalls: Record<string, [string, unknown][]> = {};
  const gteCalls: Record<string, [string, unknown][]> = {};

  const builder = (table: string, list: unknown[]) => {
    isCalls[table] = [];
    gteCalls[table] = [];
    const err = opts.error?.table === table ? opts.error.err : null;
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      is: (col: string, val: unknown) => {
        isCalls[table].push([col, val]);
        return b;
      },
      gte: (col: string, val: unknown) => {
        gteCalls[table].push([col, val]);
        return b;
      },
      order: () => b,
      // Awaited directly: `await supabase.from(t).select(...)...` resolves here.
      then: (resolve: (v: { data: unknown[] | null; error: unknown }) => unknown) =>
        resolve({ data: err ? null : list, error: err }),
    };
    return b;
  };

  const client = {
    from: (table: string) => builder(table, (rows as Record<string, unknown[]>)[table] ?? []),
  };

  return { client: client as unknown as SupabaseServer, isCalls, gteCalls };
}

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

  it("throws on a query error (e.g. ventas)", async () => {
    const { client } = makeFake(
      { clientes: [cliente()], ventas: [venta()], asistencias: [asistencia()], paquetes: [paquete()] },
      { error: { table: "ventas", err: new Error("boom") } },
    );

    await expect(getRespaldoData(client)).rejects.toThrow("boom");
  });
});
