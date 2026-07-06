import { describe, expect, it } from "vitest";

import {
  actualizarCoach,
  crearCoach,
  establecerCoachActivo,
  getCoaches,
  reordenarCoaches,
} from "./coach";
import type { SupabaseServer } from "./supabase";

/**
 * The seam: every coach write takes an injectable client (ADR-0001). Unlike
 * paquetes/plantillas, the coach table has no RPC (issue #43 forbids live DDL —
 * #37's migration shipped table + RLS only), so these writers hit
 * `supabase.from("coach")` directly; RLS (`is_staff_of`) is the write boundary,
 * matched here by a hand-rolled chain-capturing fake (no shared query builder
 * exists for insert/update yet — supabase-fake.test-helper.ts only covers reads).
 */
interface WriteCall {
  table: string;
  op: "insert" | "update";
  payload: Record<string, unknown>;
  eq?: [string, unknown];
}

function makeFake(
  opts: {
    sub?: string | null;
    coaches?: unknown[];
    errorOp?: "insert" | "update";
  } = {},
) {
  const sub = opts.sub === undefined ? "op-1" : opts.sub;
  const coaches = opts.coaches ?? [];
  const calls: WriteCall[] = [];

  function table(name: string) {
    if (name === "gym_membership") {
      return {
        select: () => ({
          limit: () => ({ maybeSingle: async () => ({ data: { gym_id: "gym-1" }, error: null }) }),
        }),
      };
    }
    if (name === "gym") {
      return {
        select: () => ({
          eq: () => ({ maybeSingle: async () => ({ data: { timezone: "America/Chihuahua" }, error: null }) }),
        }),
      };
    }

    const b: Record<string, unknown> = {
      select: () => b,
      order: () => b,
      // Terminal `.update(...).eq(...)` — records the row filter and resolves.
      eq: (col: string, val: unknown) => {
        const last = calls[calls.length - 1];
        last.eq = [col, val];
        const err = opts.errorOp === "update" ? { message: "boom" } : null;
        return Promise.resolve({ error: err });
      },
      insert: (payload: Record<string, unknown>) => {
        calls.push({ table: name, op: "insert", payload });
        const err = opts.errorOp === "insert" ? { message: "boom" } : null;
        return Promise.resolve({ error: err });
      },
      update: (payload: Record<string, unknown>) => {
        calls.push({ table: name, op: "update", payload });
        return b;
      },
      then: (resolve: (v: { data: unknown[] | null; error: unknown }) => unknown) =>
        resolve({ data: coaches, error: null }),
    };
    return b;
  }

  const client = {
    auth: { getClaims: async () => ({ data: sub ? { claims: { sub } } : null }) },
    from: table,
  };
  return { client: client as unknown as SupabaseServer, calls };
}

const ID = "11111111-1111-4111-8111-111111111111";
const validNuevo = (over: Record<string, unknown> = {}) => ({
  nombre: "Marisa",
  iniciales: "MA",
  rol: "Head coach",
  especialidad: "CrossFit",
  bio: "10 años de experiencia",
  ...over,
});

describe("coach DAL — reads", () => {
  it("getCoaches maps every row (active + inactive), ordered by sort_order", async () => {
    const fake = makeFake({
      coaches: [
        {
          id: "c1",
          name: "Marisa",
          initials: "MA",
          role: "Head coach",
          specialty: "CrossFit",
          bio: "Bio",
          is_active: true,
          sort_order: 0,
        },
        {
          id: "c2",
          name: "Paty",
          initials: "PA",
          role: "Coach",
          specialty: null,
          bio: null,
          is_active: false,
          sort_order: 1,
        },
      ],
    });
    const list = await getCoaches(fake.client);
    expect(list).toEqual([
      { id: "c1", nombre: "Marisa", iniciales: "MA", rol: "Head coach", especialidad: "CrossFit", bio: "Bio", activo: true, orden: 0 },
      { id: "c2", nombre: "Paty", iniciales: "PA", rol: "Coach", especialidad: null, bio: null, activo: false, orden: 1 },
    ]);
  });

  it("getCoaches returns [] when the read errors (best-effort)", async () => {
    const errBuilder: Record<string, unknown> = {
      select: () => errBuilder,
      order: () => errBuilder,
      then: (r: (v: { data: null; error: unknown }) => unknown) => r({ data: null, error: { message: "x" } }),
    };
    const fake = makeFake();
    const origFrom = fake.client.from as unknown as (t: string) => unknown;
    fake.client.from = ((t: string) => (t === "coach" ? errBuilder : origFrom(t))) as SupabaseServer["from"];
    const list = await getCoaches(fake.client);
    expect(list).toEqual([]);
  });
});

describe("coach DAL — write orchestration (injected fake)", () => {
  it("crearCoach inserts the gym-scoped row with the exact column mapping", async () => {
    const fake = makeFake();
    await crearCoach(validNuevo(), fake.client);
    expect(fake.calls).toEqual([
      {
        table: "coach",
        op: "insert",
        payload: {
          gym_id: "gym-1",
          name: "Marisa",
          initials: "MA",
          role: "Head coach",
          specialty: "CrossFit",
          bio: "10 años de experiencia",
        },
      },
    ]);
  });

  it("crearCoach normalizes blank especialidad/bio to null", async () => {
    const fake = makeFake();
    await crearCoach(validNuevo({ especialidad: "  ", bio: undefined }), fake.client);
    expect(fake.calls[0].payload.specialty).toBeNull();
    expect(fake.calls[0].payload.bio).toBeNull();
  });

  it("actualizarCoach updates the exact column mapping by id", async () => {
    const fake = makeFake();
    await actualizarCoach({ id: ID, ...validNuevo({ nombre: "Marisa G." }) }, fake.client);
    expect(fake.calls).toEqual([
      {
        table: "coach",
        op: "update",
        payload: {
          name: "Marisa G.",
          initials: "MA",
          role: "Head coach",
          specialty: "CrossFit",
          bio: "10 años de experiencia",
        },
        eq: ["id", ID],
      },
    ]);
  });

  it("establecerCoachActivo sends only is_active", async () => {
    const fake = makeFake();
    await establecerCoachActivo({ id: ID, activo: false }, fake.client);
    expect(fake.calls).toEqual([{ table: "coach", op: "update", payload: { is_active: false }, eq: ["id", ID] }]);
  });

  it("reordenarCoaches writes sort_order = array index for every id", async () => {
    const ID2 = "22222222-2222-4222-8222-222222222222";
    const ID3 = "33333333-3333-4333-8333-333333333333";
    const fake = makeFake();
    await reordenarCoaches({ ids: [ID2, ID, ID3] }, fake.client);
    expect(fake.calls).toContainEqual({ table: "coach", op: "update", payload: { sort_order: 0 }, eq: ["id", ID2] });
    expect(fake.calls).toContainEqual({ table: "coach", op: "update", payload: { sort_order: 1 }, eq: ["id", ID] });
    expect(fake.calls).toContainEqual({ table: "coach", op: "update", payload: { sort_order: 2 }, eq: ["id", ID3] });
  });

  it("throws a generic es-MX error when the insert fails", async () => {
    const fake = makeFake({ errorOp: "insert" });
    await expect(crearCoach(validNuevo(), fake.client)).rejects.toThrow("No se pudo crear el coach");
  });

  it("throws a generic es-MX error when the update fails", async () => {
    const fake = makeFake({ errorOp: "update" });
    await expect(actualizarCoach({ id: ID, ...validNuevo() }, fake.client)).rejects.toThrow(
      "No se pudo actualizar el coach",
    );
  });

  it("rejects an empty nombre (zod) before any write", async () => {
    const fake = makeFake();
    await expect(crearCoach(validNuevo({ nombre: "  " }), fake.client)).rejects.toThrow();
    expect(fake.calls).toHaveLength(0);
  });

  it("rejects an empty rol (zod) before any write", async () => {
    const fake = makeFake();
    await expect(crearCoach(validNuevo({ rol: "" }), fake.client)).rejects.toThrow();
    expect(fake.calls).toHaveLength(0);
  });

  it("rejects a non-uuid id on actualizarCoach (zod) before any write", async () => {
    const fake = makeFake();
    await expect(actualizarCoach({ id: "nope", ...validNuevo() }, fake.client)).rejects.toThrow();
    expect(fake.calls).toHaveLength(0);
  });

  it("throws 'No autenticado' from crearCoach when unauthenticated", async () => {
    const fake = makeFake({ sub: null });
    await expect(crearCoach(validNuevo(), fake.client)).rejects.toThrow("No autenticado");
    expect(fake.calls).toHaveLength(0);
  });

  it("throws 'No autenticado' from actualizarCoach when unauthenticated", async () => {
    const fake = makeFake({ sub: null });
    await expect(actualizarCoach({ id: ID, ...validNuevo() }, fake.client)).rejects.toThrow("No autenticado");
    expect(fake.calls).toHaveLength(0);
  });
});
