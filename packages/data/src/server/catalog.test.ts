import { describe, expect, it } from "vitest";

import { crearClassType, getClassTypes, getCoaches } from "./catalog";
import type { SupabaseServer } from "./supabase";

/**
 * Catalog readers/mint for the Agenda editor (PRD #36 e): the coach multi-select
 * and the extensible tipo picker read `coach`/`class_type`, and the picker's `+`
 * mints a real `class_type`. Isolation is RLS-by-membership (ADR-0013) — no manual
 * gym_id filter on reads; the mint stamps gym_id from getOperatorGym. Orchestration
 * is exercised with an injected fake (ADR-0001); the RLS policies are proven against
 * the real schema in supabase/tests/.
 */

interface Rows {
  coach?: Record<string, unknown>[];
  class_type?: Record<string, unknown>[];
}

interface Insert {
  table: string;
  values: Record<string, unknown>;
}

function makeFake(
  rows: Rows = {},
  opts: { sub?: string | null; insertError?: { message: string } } = {},
) {
  const sub = opts.sub === undefined ? "op-1" : opts.sub;
  const inserts: Insert[] = [];

  function builder(table: string, list: Record<string, unknown>[]) {
    let filtered = list;
    let orderCol: string | null = null;
    let inserted: Record<string, unknown> | null = null;
    const b: Record<string, unknown> = {
      select: () => b,
      eq: (col: string, val: unknown) => {
        filtered = filtered.filter((r) => r[col] === val);
        return b;
      },
      order: (col: string) => {
        orderCol = orderCol ?? col;
        return b;
      },
      limit: () => b,
      insert: (values: Record<string, unknown>) => {
        inserts.push({ table, values });
        inserted = { id: "new-ct-id", ...values };
        return b;
      },
      maybeSingle: async () => ({ data: filtered[0] ?? null, error: null }),
      single: async () => {
        if (opts.insertError) return { data: null, error: opts.insertError };
        return { data: inserted ? { id: inserted.id } : null, error: null };
      },
      then: (resolve: (v: { data: unknown[]; error: null }) => unknown) => {
        const out = orderCol
          ? [...filtered].sort((a, b2) =>
              (a[orderCol as string] as number | string) > (b2[orderCol as string] as number | string) ? 1 : -1,
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
      if (table === "gym") return builder(table, [{ id: "gym-1", timezone: "America/Chihuahua" }]);
      return builder(table, (rows as Record<string, Record<string, unknown>[]>)[table] ?? []);
    },
  };
  return { client: client as unknown as SupabaseServer, inserts };
}

describe("getCoaches", () => {
  it("maps active coach rows to {id,label}", async () => {
    const { client } = makeFake({
      coach: [
        { id: "co1", name: "Marisa", is_active: true, sort_order: 1 },
        { id: "co2", name: "Paty", is_active: true, sort_order: 0 },
      ],
    });
    const coaches = await getCoaches(client);
    expect(coaches).toEqual([
      { id: "co2", label: "Paty" },
      { id: "co1", label: "Marisa" },
    ]);
  });

  it("returns [] when the gym has no coaches", async () => {
    const { client } = makeFake({ coach: [] });
    expect(await getCoaches(client)).toEqual([]);
  });
});

describe("getClassTypes", () => {
  it("maps class_type rows to {id,name}, alphabetized by name", async () => {
    const { client } = makeFake({
      class_type: [
        { id: "ct1", name: "Funcional" },
        { id: "ct2", name: "Box" },
      ],
    });
    expect(await getClassTypes(client)).toEqual([
      { id: "ct2", name: "Box" },
      { id: "ct1", name: "Funcional" },
    ]);
  });
});

describe("crearClassType", () => {
  it("inserts {gym_id, name} (gym from membership) and returns the new id", async () => {
    const { client, inserts } = makeFake();
    const result = await crearClassType({ name: "  Metcon  " }, client);
    expect(result).toEqual({ ok: true, id: "new-ct-id" });
    expect(inserts).toEqual([{ table: "class_type", values: { gym_id: "gym-1", name: "Metcon" } }]);
  });

  it("rejects a blank name before any insert", async () => {
    const { client, inserts } = makeFake();
    const result = await crearClassType({ name: "   " }, client);
    expect(result.ok).toBe(false);
    expect(inserts).toHaveLength(0);
  });

  it("surfaces a duplicate-name insert error as a typed result", async () => {
    const { client } = makeFake({}, { insertError: { message: "duplicate key value violates unique constraint" } });
    const result = await crearClassType({ name: "Funcional" }, client);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("duplicate");
  });

  it("surfaces 'No autenticado' when unauthenticated, before any insert", async () => {
    const { client, inserts } = makeFake({}, { sub: null });
    const result = await crearClassType({ name: "Metcon" }, client);
    expect(result).toEqual({ ok: false, error: "No autenticado" });
    expect(inserts).toHaveLength(0);
  });
});
