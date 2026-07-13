import { describe, expect, it } from "vitest";

import {
  actualizarClassType,
  actualizarClassTypeItem,
  crearClassType,
  crearClassTypeItem,
  getClassTypes,
  reordenarBloques,
  reordenarPorTraer,
} from "./class-type";
import type { SupabaseServer } from "./supabase";

/**
 * Same seam as coach.ts (see its test file header): no RPC exists for these
 * tables (#37 shipped table + RLS only, no live DDL this slice), so every
 * writer hits `supabase.from(...)` directly — a hand-rolled chain-capturing
 * fake stands in for RLS/the DB.
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
    classTypes?: unknown[];
    errorOp?: "insert" | "update";
    errorTable?: string;
  } = {},
) {
  const sub = opts.sub === undefined ? "op-1" : opts.sub;
  const classTypes = opts.classTypes ?? [];
  const calls: WriteCall[] = [];

  function table(name: string) {
    if (name === "gym_membership") {
      return {
        select: () => ({
          in: () => ({
            order: () => ({
              limit: () => ({ maybeSingle: async () => ({ data: { gym_id: "gym-1" }, error: null }) }),
            }),
          }),
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

    const errsHere = opts.errorTable === undefined || opts.errorTable === name;
    const b: Record<string, unknown> = {
      select: () => b,
      order: () => b,
      eq: (col: string, val: unknown) => {
        const last = calls[calls.length - 1];
        if (last && last.table === name && last.op === "update" && last.eq === undefined) {
          last.eq = [col, val];
          const err = errsHere && opts.errorOp === "update" ? { message: "boom" } : null;
          return Promise.resolve({ error: err });
        }
        return b; // read-path .eq — keep chaining
      },
      insert: (payload: Record<string, unknown>) => {
        calls.push({ table: name, op: "insert", payload });
        const err = errsHere && opts.errorOp === "insert" ? { message: "boom" } : null;
        return Promise.resolve({ error: err });
      },
      update: (payload: Record<string, unknown>) => {
        calls.push({ table: name, op: "update", payload });
        return b;
      },
      then: (resolve: (v: { data: unknown[] | null; error: unknown }) => unknown) =>
        resolve({ data: name === "class_type" ? classTypes : [], error: null }),
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
const CT_ID = "22222222-2222-4222-8222-222222222222";

const validNuevo = (over: Record<string, unknown> = {}) => ({
  nombre: "CrossFit",
  sala: "Sala A",
  nivel: "Intermedio",
  descripcion: "Entrenamiento funcional de alta intensidad",
  duracionMin: 60,
  ...over,
});

describe("class-type DAL — reads", () => {
  it("getClassTypes maps rows + embedded, ordered children", async () => {
    const fake = makeFake({
      classTypes: [
        {
          id: CT_ID,
          name: "CrossFit",
          sala: "Sala A",
          level: "Intermedio",
          description: "Alta intensidad",
          default_duration_min: 60,
          class_type_workblock: [{ id: "w1", label: "Calentamiento", sort_order: 0 }],
          class_type_bring_item: [{ id: "b1", label: "Toalla", sort_order: 0 }],
        },
      ],
    });
    const list = await getClassTypes(fake.client);
    expect(list).toEqual([
      {
        id: CT_ID,
        nombre: "CrossFit",
        sala: "Sala A",
        nivel: "Intermedio",
        descripcion: "Alta intensidad",
        duracionMin: 60,
        bloques: [{ id: "w1", etiqueta: "Calentamiento", orden: 0 }],
        porTraer: [{ id: "b1", etiqueta: "Toalla", orden: 0 }],
      },
    ]);
  });

  it("getClassTypes returns [] when the read errors (best-effort)", async () => {
    const errBuilder: Record<string, unknown> = {
      select: () => errBuilder,
      order: () => errBuilder,
      then: (r: (v: { data: null; error: unknown }) => unknown) => r({ data: null, error: { message: "x" } }),
    };
    const fake = makeFake();
    const origFrom = fake.client.from as unknown as (t: string) => unknown;
    fake.client.from = ((t: string) =>
      t === "class_type" ? errBuilder : origFrom(t)) as SupabaseServer["from"];
    const list = await getClassTypes(fake.client);
    expect(list).toEqual([]);
  });
});

describe("class-type DAL — parent write orchestration", () => {
  it("crearClassType inserts the gym-scoped row with the exact column mapping", async () => {
    const fake = makeFake();
    await crearClassType(validNuevo(), fake.client);
    expect(fake.calls).toEqual([
      {
        table: "class_type",
        op: "insert",
        payload: {
          gym_id: "gym-1",
          name: "CrossFit",
          sala: "Sala A",
          level: "Intermedio",
          description: "Entrenamiento funcional de alta intensidad",
          default_duration_min: 60,
        },
      },
    ]);
  });

  it("crearClassType normalizes blank optional fields to null", async () => {
    const fake = makeFake();
    await crearClassType(validNuevo({ sala: "  ", nivel: undefined, descripcion: null, duracionMin: null }), fake.client);
    expect(fake.calls[0].payload).toMatchObject({
      sala: null,
      level: null,
      description: null,
      default_duration_min: null,
    });
  });

  it("actualizarClassType updates the exact column mapping by id", async () => {
    const fake = makeFake();
    await actualizarClassType({ id: CT_ID, ...validNuevo({ nombre: "CrossFit PM" }) }, fake.client);
    expect(fake.calls).toEqual([
      {
        table: "class_type",
        op: "update",
        payload: {
          name: "CrossFit PM",
          sala: "Sala A",
          level: "Intermedio",
          description: "Entrenamiento funcional de alta intensidad",
          default_duration_min: 60,
        },
        eq: ["id", CT_ID],
      },
    ]);
  });

  it("maps a class_type_name_gym_uq violation to a friendly duplicate-name message", async () => {
    const fake = makeFake({ errorOp: "insert", errorTable: "class_type" });
    const origFrom = fake.client.from as unknown as (t: string) => Record<string, unknown>;
    fake.client.from = ((t: string) => {
      const b = origFrom(t);
      if (t !== "class_type") return b as never;
      return {
        ...b,
        insert: () =>
          Promise.resolve({
            error: { code: "23505", message: 'duplicate key value violates unique constraint "class_type_name_gym_uq"' },
          }),
      };
    }) as unknown as SupabaseServer["from"];
    await expect(crearClassType(validNuevo(), fake.client)).rejects.toThrow(
      "Ya existe un tipo de clase con ese nombre",
    );
  });

  it("throws a generic es-MX error when the update fails", async () => {
    const fake = makeFake({ errorOp: "update", errorTable: "class_type" });
    await expect(actualizarClassType({ id: CT_ID, ...validNuevo() }, fake.client)).rejects.toThrow(
      "No se pudo actualizar el tipo de clase",
    );
  });

  it("maps a rename collision (class_type_name_gym_uq on UPDATE) to the friendly duplicate-name message", async () => {
    const fake = makeFake();
    const origFrom = fake.client.from as unknown as (t: string) => Record<string, unknown>;
    fake.client.from = ((t: string) => {
      const b = origFrom(t);
      if (t !== "class_type") return b as never;
      return {
        ...b,
        update: () => ({
          eq: () =>
            Promise.resolve({
              error: { code: "23505", message: 'duplicate key value violates unique constraint "class_type_name_gym_uq"' },
            }),
        }),
      };
    }) as unknown as SupabaseServer["from"];
    await expect(actualizarClassType({ id: CT_ID, ...validNuevo() }, fake.client)).rejects.toThrow(
      "Ya existe un tipo de clase con ese nombre",
    );
  });

  it("rejects an empty nombre (zod) before any write", async () => {
    const fake = makeFake();
    await expect(crearClassType(validNuevo({ nombre: " " }), fake.client)).rejects.toThrow();
    expect(fake.calls).toHaveLength(0);
  });

  it("throws 'No autenticado' when unauthenticated", async () => {
    const fake = makeFake({ sub: null });
    await expect(crearClassType(validNuevo(), fake.client)).rejects.toThrow("No autenticado");
    expect(fake.calls).toHaveLength(0);
  });
});

describe("class-type DAL — child item write orchestration (bloques/porTraer)", () => {
  it("crearClassTypeItem inserts into class_type_workblock for bloques", async () => {
    const fake = makeFake();
    await crearClassTypeItem("bloques", { classTypeId: CT_ID, etiqueta: "AMRAP", orden: 2 }, fake.client);
    expect(fake.calls).toEqual([
      {
        table: "class_type_workblock",
        op: "insert",
        payload: { gym_id: "gym-1", class_type_id: CT_ID, label: "AMRAP", sort_order: 2 },
      },
    ]);
  });

  it("crearClassTypeItem inserts into class_type_bring_item for porTraer", async () => {
    const fake = makeFake();
    await crearClassTypeItem("porTraer", { classTypeId: CT_ID, etiqueta: "Toalla", orden: 0 }, fake.client);
    expect(fake.calls).toEqual([
      {
        table: "class_type_bring_item",
        op: "insert",
        payload: { gym_id: "gym-1", class_type_id: CT_ID, label: "Toalla", sort_order: 0 },
      },
    ]);
  });

  it("actualizarClassTypeItem updates only the label, by id", async () => {
    const fake = makeFake();
    await actualizarClassTypeItem("bloques", { id: ID, etiqueta: "Calentamiento" }, fake.client);
    expect(fake.calls).toEqual([
      { table: "class_type_workblock", op: "update", payload: { label: "Calentamiento" }, eq: ["id", ID] },
    ]);
  });

  it("reordenarBloques writes sort_order = array index on class_type_workblock", async () => {
    const ID2 = "33333333-3333-4333-8333-333333333333";
    const fake = makeFake();
    await reordenarBloques({ ids: [ID2, ID] }, fake.client);
    expect(fake.calls).toContainEqual({
      table: "class_type_workblock",
      op: "update",
      payload: { sort_order: 0 },
      eq: ["id", ID2],
    });
    expect(fake.calls).toContainEqual({
      table: "class_type_workblock",
      op: "update",
      payload: { sort_order: 1 },
      eq: ["id", ID],
    });
  });

  it("reordenarPorTraer writes sort_order = array index on class_type_bring_item", async () => {
    const fake = makeFake();
    await reordenarPorTraer({ ids: [ID] }, fake.client);
    expect(fake.calls).toEqual([
      { table: "class_type_bring_item", op: "update", payload: { sort_order: 0 }, eq: ["id", ID] },
    ]);
  });

  it("rejects an empty etiqueta (zod) before any write", async () => {
    const fake = makeFake();
    await expect(
      crearClassTypeItem("bloques", { classTypeId: CT_ID, etiqueta: " ", orden: 0 }, fake.client),
    ).rejects.toThrow();
    expect(fake.calls).toHaveLength(0);
  });
});
