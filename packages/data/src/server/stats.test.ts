import { describe, expect, it } from "vitest";

import { actualizarStat, crearStat, eliminarStat, listStats, reordenarStats } from "./stats";
import type { SupabaseServer } from "./supabase";

/**
 * The seam: every stat write takes an injectable client (ADR-0001), so the
 * orchestration — zod validation, the auth gate, the next-sort_order read, and the
 * exact insert/update/delete payload — is testable with a hand-rolled fake. RLS
 * ownership itself (staff write, member read, cross-tenant denial) is proven
 * against the real schema in supabase/tests/gym_content_denial.sql (ADR-0013).
 */
interface FakeOpts {
  sub?: string | null;
  rows?: Record<string, unknown>[];
  updateData?: unknown[] | null;
  deleteData?: unknown[] | null;
  insertError?: unknown;
  updateError?: unknown;
  deleteError?: unknown;
}

interface Calls {
  insert?: Record<string, unknown>;
  updates: { id: string; payload: Record<string, unknown> }[];
  deletes: string[];
}

function awaitable<T extends object>(value: unknown, extra: T): T {
  return { ...extra, then: (resolve: (v: unknown) => unknown) => resolve(value) } as T;
}

function makeFake(opts: FakeOpts = {}): { client: SupabaseServer; calls: Calls } {
  const sub = opts.sub === undefined ? "op-1" : opts.sub;
  const calls: Calls = { updates: [], deletes: [] };
  const rows = opts.rows ?? [];

  const client = {
    auth: { getClaims: async () => ({ data: sub ? { claims: { sub } } : null }) },
    from: (table: string) => {
      if (table === "gym_membership") {
        return {
          select: () => ({
            in: () => ({
              order: () => ({ limit: () => ({ maybeSingle: async () => ({ data: { gym_id: "gym-1" }, error: null }) }) }),
            }),
          }),
        };
      }
      if (table === "gym") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { timezone: "America/Chihuahua" }, error: null }) }) }) };
      }

      return {
        select: (cols: string) => {
          if (cols === "sort_order") {
            return {
              eq: () => ({
                order: () => ({
                  limit: () => ({
                    maybeSingle: async () => ({ data: rows.length ? rows[rows.length - 1] : null, error: null }),
                  }),
                }),
              }),
            };
          }
          return { order: async () => ({ data: rows, error: null }) };
        },
        insert: (payload: Record<string, unknown>) => {
          calls.insert = payload;
          return Promise.resolve({ error: opts.insertError ?? null });
        },
        update: (payload: Record<string, unknown>) => ({
          eq: (_col: string, id: string) => {
            calls.updates.push({ id, payload });
            return awaitable(
              { error: opts.updateError ?? null },
              { select: async () => ({ data: opts.updateData !== undefined ? opts.updateData : [{ id }], error: opts.updateError ?? null }) },
            );
          },
        }),
        delete: () => ({
          eq: (_col: string, id: string) => {
            calls.deletes.push(id);
            return {
              select: async () => ({ data: opts.deleteData !== undefined ? opts.deleteData : [{ id }], error: opts.deleteError ?? null }),
            };
          },
        }),
      };
    },
  };
  return { client: client as unknown as SupabaseServer, calls };
}

const ID = "11111111-1111-4111-8111-111111111111";

describe("stats DAL — write orchestration (injected fake)", () => {
  it("listStats maps rows -> StatDTO[]", async () => {
    const fake = makeFake({ rows: [{ id: "s1", label: "Miembros activos", value: "500+", sort_order: 0 }] });
    const list = await listStats(fake.client);
    expect(list).toEqual([{ id: "s1", label: "Miembros activos", value: "500+" }]);
  });

  it("crearStat appends sort_order = 0 when the gym has no existing rows", async () => {
    const fake = makeFake({ rows: [] });
    await crearStat({ label: "Miembros activos", value: "500+" }, fake.client);
    expect(fake.calls.insert).toEqual({
      gym_id: "gym-1",
      label: "Miembros activos",
      value: "500+",
      sort_order: 0,
    });
  });

  it("crearStat appends after the current last sort_order", async () => {
    const fake = makeFake({ rows: [{ id: "s1", sort_order: 2 }] });
    await crearStat({ label: "Clases por semana", value: "40+" }, fake.client);
    expect(fake.calls.insert?.sort_order).toBe(3);
  });

  it("actualizarStat sends the exact update payload for the given id", async () => {
    const fake = makeFake();
    await actualizarStat({ id: ID, label: "Miembros activos+", value: "600+" }, fake.client);
    expect(fake.calls.updates).toEqual([{ id: ID, payload: { label: "Miembros activos+", value: "600+" } }]);
  });

  it("actualizarStat throws 'no encontrado' when the update affects 0 rows (RLS hid it)", async () => {
    const fake = makeFake({ updateData: [] });
    await expect(actualizarStat({ id: ID, label: "x", value: "y" }, fake.client)).rejects.toThrow("Stat no encontrado");
  });

  it("eliminarStat deletes by id", async () => {
    const fake = makeFake();
    await eliminarStat({ id: ID }, fake.client);
    expect(fake.calls.deletes).toEqual([ID]);
  });

  it("eliminarStat throws 'no encontrado' when the delete affects 0 rows (RLS hid it)", async () => {
    const fake = makeFake({ deleteData: [] });
    await expect(eliminarStat({ id: ID }, fake.client)).rejects.toThrow("Stat no encontrado");
  });

  it("reordenarStats sets sort_order = index for every id in order", async () => {
    const fake = makeFake();
    const [a, b, c] = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ];
    await reordenarStats({ ids: [a, b, c] }, fake.client);
    expect(fake.calls.updates).toEqual([
      { id: a, payload: { sort_order: 0 } },
      { id: b, payload: { sort_order: 1 } },
      { id: c, payload: { sort_order: 2 } },
    ]);
  });

  it("rejects an empty label (zod) before any write", async () => {
    const fake = makeFake();
    await expect(crearStat({ label: "  ", value: "1" }, fake.client)).rejects.toThrow();
    expect(fake.calls.insert).toBeUndefined();
  });

  it("rejects an over-length value (zod) before any write", async () => {
    const fake = makeFake();
    await expect(crearStat({ label: "X", value: "a".repeat(31) }, fake.client)).rejects.toThrow();
    expect(fake.calls.insert).toBeUndefined();
  });

  it("throws 'No autenticado' when getClaims returns no sub", async () => {
    const fake = makeFake({ sub: null });
    await expect(crearStat({ label: "X", value: "y" }, fake.client)).rejects.toThrow("No autenticado");
    expect(fake.calls.insert).toBeUndefined();
  });
});
