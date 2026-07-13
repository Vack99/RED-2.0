import { describe, expect, it } from "vitest";

import {
  actualizarAboutValue,
  crearAboutValue,
  eliminarAboutValue,
  listAboutValues,
  reordenarAboutValues,
} from "./about-values";
import type { SupabaseServer } from "./supabase";

/**
 * The seam: every about_value write takes an injectable client (ADR-0001), so the
 * orchestration — zod validation, the auth gate, the next-sort_order read, and the
 * exact insert/update/delete payload — is testable with a hand-rolled fake. RLS
 * ownership itself (staff write, member read, cross-tenant denial) is proven
 * against the real schema in supabase/tests/gym_content_denial.sql (ADR-0013).
 *
 * `then` is implemented alongside the chain methods on every builder (mirroring
 * the real supabase-js query builder, which is simultaneously chainable AND
 * thenable) — reordenarAboutValues awaits `.update(...).eq(...)` directly, with
 * no trailing `.select()`.
 */
interface FakeOpts {
  sub?: string | null;
  /** Seeded about_value rows — used both for the list read and the "last sort_order" probe. */
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
              order: () => ({
                limit: () => ({
                  maybeSingle: async () => ({ data: { gym_id: "gym-1" }, error: null }),
                }),
              }),
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
            // crearAboutValue's "last sort_order" probe: .eq().order().limit().maybeSingle()
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
          // listAboutValues: .order() awaited directly
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

describe("about-values DAL — write orchestration (injected fake)", () => {
  it("listAboutValues maps rows -> AboutValueDTO[]", async () => {
    const fake = makeFake({ rows: [{ id: "v1", title: "Comunidad", description: "Juntos, no solos.", sort_order: 0 }] });
    const list = await listAboutValues(fake.client);
    expect(list).toEqual([{ id: "v1", title: "Comunidad", description: "Juntos, no solos." }]);
  });

  it("crearAboutValue appends sort_order = 0 when the gym has no existing rows", async () => {
    const fake = makeFake({ rows: [] });
    await crearAboutValue({ title: "Comunidad", description: "Juntos, no solos." }, fake.client);
    expect(fake.calls.insert).toEqual({
      gym_id: "gym-1",
      title: "Comunidad",
      description: "Juntos, no solos.",
      sort_order: 0,
    });
  });

  it("crearAboutValue appends after the current last sort_order", async () => {
    const fake = makeFake({ rows: [{ id: "v1", sort_order: 2 }] });
    await crearAboutValue({ title: "Disciplina", description: "Todos los días." }, fake.client);
    expect(fake.calls.insert?.sort_order).toBe(3);
  });

  it("actualizarAboutValue sends the exact update payload for the given id", async () => {
    const fake = makeFake();
    await actualizarAboutValue({ id: ID, title: "Comunidad+", description: "x" }, fake.client);
    expect(fake.calls.updates).toEqual([{ id: ID, payload: { title: "Comunidad+", description: "x" } }]);
  });

  it("actualizarAboutValue throws 'no encontrado' when the update affects 0 rows (RLS hid it)", async () => {
    const fake = makeFake({ updateData: [] });
    await expect(actualizarAboutValue({ id: ID, title: "x", description: "y" }, fake.client)).rejects.toThrow(
      "Valor no encontrado",
    );
  });

  it("eliminarAboutValue deletes by id", async () => {
    const fake = makeFake();
    await eliminarAboutValue({ id: ID }, fake.client);
    expect(fake.calls.deletes).toEqual([ID]);
  });

  it("eliminarAboutValue throws 'no encontrado' when the delete affects 0 rows (RLS hid it)", async () => {
    const fake = makeFake({ deleteData: [] });
    await expect(eliminarAboutValue({ id: ID }, fake.client)).rejects.toThrow("Valor no encontrado");
  });

  it("reordenarAboutValues sets sort_order = index for every id in order", async () => {
    const fake = makeFake();
    const [a, b, c] = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ];
    await reordenarAboutValues({ ids: [a, b, c] }, fake.client);
    expect(fake.calls.updates).toEqual([
      { id: a, payload: { sort_order: 0 } },
      { id: b, payload: { sort_order: 1 } },
      { id: c, payload: { sort_order: 2 } },
    ]);
  });

  it("rejects an empty title (zod) before any write", async () => {
    const fake = makeFake();
    await expect(crearAboutValue({ title: "  ", description: "x" }, fake.client)).rejects.toThrow();
    expect(fake.calls.insert).toBeUndefined();
  });

  it("rejects an over-length description (zod) before any write", async () => {
    const fake = makeFake();
    await expect(crearAboutValue({ title: "X", description: "a".repeat(401) }, fake.client)).rejects.toThrow();
    expect(fake.calls.insert).toBeUndefined();
  });

  it("throws 'No autenticado' when getClaims returns no sub", async () => {
    const fake = makeFake({ sub: null });
    await expect(crearAboutValue({ title: "X", description: "y" }, fake.client)).rejects.toThrow("No autenticado");
    expect(fake.calls.insert).toBeUndefined();
  });
});
