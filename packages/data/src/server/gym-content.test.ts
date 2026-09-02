import { describe, expect, it } from "vitest";

import {
  actualizarAboutValue,
  actualizarFacility,
  actualizarFaq,
  actualizarHorario,
  actualizarStat,
  crearAboutValue,
  crearFacility,
  crearFaq,
  crearStat,
  eliminarAboutValue,
  eliminarFacility,
  eliminarFaq,
  eliminarStat,
  getFaqsPublicas,
  getInstalacionesPublicas,
  getStatsPublicas,
  getValoresPublicos,
  listAboutValues,
  listFacilities,
  listFaqs,
  listStats,
  reordenarAboutValues,
  reordenarFacilities,
  reordenarFaqs,
  reordenarStats,
} from "./gym-content";
import type { SupabaseServer } from "./supabase";

/**
 * The seam: every write takes an injectable client (ADR-0001), so the orchestration — zod validation,
 * the auth gate, the next-sort_order read, and the exact insert/update/delete payload — is testable with
 * a hand-rolled fake shared across all four "Contenido del gimnasio" resources (about_value, facility,
 * faq, stat — they follow the identical shape). RLS ownership itself (staff write, member read,
 * cross-tenant denial) is proven against the real schema in supabase/tests/gym_content_denial.sql
 * (ADR-0013); the anon public reads (below) are proven in supabase/tests/anon_catalog_read.sql — here we
 * assert the mapping and the gym-scoping filter.
 *
 * `then` is implemented alongside the chain methods on every builder (mirroring the real supabase-js
 * query builder, which is simultaneously chainable AND thenable) — `reordenar*` awaits `.update(...).eq(...)`
 * directly, with no trailing `.select()`.
 */
interface FakeOpts {
  sub?: string | null;
  /** Seeded rows — used both for the list read and the "last sort_order" probe. */
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
      // getOperatorGyms reads gym_membership with an embedded `gym(...)` FK join.
      if (table === "gym_membership") {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                order: async () => ({
                  data: [{ gym_id: "gym-1", gym: { timezone: "America/Chihuahua", slug: "forge", brand_name: "Forge" } }],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }

      return {
        select: (cols: string) => {
          if (cols === "sort_order") {
            // crear*'s "last sort_order" probe: .eq().order().limit().maybeSingle()
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
          // list*: .eq("gym_id", …).order() — the eq actually filters the seeded
          // rows, so a multi-gym test can prove the scope (mirrors catalog.test.ts).
          return {
            eq: (col: string, val: unknown) => ({
              order: async () => ({
                data: rows.filter((r) => r[col] === val),
                error: null,
              }),
            }),
          };
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

describe("gym-content DAL — about_value write orchestration (injected fake)", () => {
  it("listAboutValues maps rows -> AboutValueDTO[]", async () => {
    const fake = makeFake({ rows: [{ id: "v1", gym_id: "gym-1", title: "Comunidad", description: "Juntos, no solos.", sort_order: 0 }] });
    const list = await listAboutValues(fake.client);
    expect(list).toEqual([{ id: "v1", title: "Comunidad", description: "Juntos, no solos." }]);
  });

  // Multi-gym staffer regression (RLS `is_member_of` ORs across every gym the caller
  // staffs — ADR-0013 — so an unscoped read would return every staffed gym's values).
  it("excludes a sibling staffed gym's values (scoped to the operator's gym-in-effect)", async () => {
    const fake = makeFake({
      rows: [
        { id: "v1", gym_id: "gym-1", title: "Comunidad", description: "x", sort_order: 0 },
        { id: "sibling", gym_id: "gym-2", title: "Ajeno", description: "y", sort_order: 0 },
      ],
    });
    const list = await listAboutValues(fake.client);
    expect(list.map((v) => v.id)).toEqual(["v1"]);
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

describe("gym-content DAL — facility write orchestration (injected fake)", () => {
  it("listFacilities maps rows -> FacilityDTO[]", async () => {
    const fake = makeFake({ rows: [{ id: "f1", gym_id: "gym-1", name: "Área de pesas", description: "Pesas libres.", sort_order: 0 }] });
    const list = await listFacilities(fake.client);
    expect(list).toEqual([{ id: "f1", name: "Área de pesas", description: "Pesas libres." }]);
  });

  it("excludes a sibling staffed gym's facilities (scoped to the operator's gym-in-effect)", async () => {
    const fake = makeFake({
      rows: [
        { id: "f1", gym_id: "gym-1", name: "Área de pesas", description: "x", sort_order: 0 },
        { id: "sibling", gym_id: "gym-2", name: "Ajeno", description: "y", sort_order: 0 },
      ],
    });
    const list = await listFacilities(fake.client);
    expect(list.map((f) => f.id)).toEqual(["f1"]);
  });

  it("crearFacility appends sort_order = 0 when the gym has no existing rows", async () => {
    const fake = makeFake({ rows: [] });
    await crearFacility({ name: "Área de pesas", description: "Pesas libres." }, fake.client);
    expect(fake.calls.insert).toEqual({
      gym_id: "gym-1",
      name: "Área de pesas",
      description: "Pesas libres.",
      sort_order: 0,
    });
  });

  it("crearFacility appends after the current last sort_order", async () => {
    const fake = makeFake({ rows: [{ id: "f1", sort_order: 2 }] });
    await crearFacility({ name: "Alberca", description: "25 metros." }, fake.client);
    expect(fake.calls.insert?.sort_order).toBe(3);
  });

  it("actualizarFacility sends the exact update payload for the given id", async () => {
    const fake = makeFake();
    await actualizarFacility({ id: ID, name: "Área de pesas+", description: "x" }, fake.client);
    expect(fake.calls.updates).toEqual([{ id: ID, payload: { name: "Área de pesas+", description: "x" } }]);
  });

  it("actualizarFacility throws 'no encontrada' when the update affects 0 rows (RLS hid it)", async () => {
    const fake = makeFake({ updateData: [] });
    await expect(actualizarFacility({ id: ID, name: "x", description: "y" }, fake.client)).rejects.toThrow(
      "Instalación no encontrada",
    );
  });

  it("eliminarFacility deletes by id", async () => {
    const fake = makeFake();
    await eliminarFacility({ id: ID }, fake.client);
    expect(fake.calls.deletes).toEqual([ID]);
  });

  it("eliminarFacility throws 'no encontrada' when the delete affects 0 rows (RLS hid it)", async () => {
    const fake = makeFake({ deleteData: [] });
    await expect(eliminarFacility({ id: ID }, fake.client)).rejects.toThrow("Instalación no encontrada");
  });

  it("reordenarFacilities sets sort_order = index for every id in order", async () => {
    const fake = makeFake();
    const [a, b, c] = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ];
    await reordenarFacilities({ ids: [a, b, c] }, fake.client);
    expect(fake.calls.updates).toEqual([
      { id: a, payload: { sort_order: 0 } },
      { id: b, payload: { sort_order: 1 } },
      { id: c, payload: { sort_order: 2 } },
    ]);
  });

  it("rejects an empty name (zod) before any write", async () => {
    const fake = makeFake();
    await expect(crearFacility({ name: "  ", description: "x" }, fake.client)).rejects.toThrow();
    expect(fake.calls.insert).toBeUndefined();
  });

  it("rejects an over-length description (zod) before any write", async () => {
    const fake = makeFake();
    await expect(crearFacility({ name: "X", description: "a".repeat(401) }, fake.client)).rejects.toThrow();
    expect(fake.calls.insert).toBeUndefined();
  });

  it("throws 'No autenticado' when getClaims returns no sub", async () => {
    const fake = makeFake({ sub: null });
    await expect(crearFacility({ name: "X", description: "y" }, fake.client)).rejects.toThrow("No autenticado");
    expect(fake.calls.insert).toBeUndefined();
  });
});

describe("gym-content DAL — faq write orchestration (injected fake)", () => {
  it("listFaqs maps rows -> FaqDTO[]", async () => {
    const fake = makeFake({
      rows: [{ id: "q1", gym_id: "gym-1", question: "¿Necesito membresía anual?", answer: "No, por clases.", sort_order: 0 }],
    });
    const list = await listFaqs(fake.client);
    expect(list).toEqual([{ id: "q1", question: "¿Necesito membresía anual?", answer: "No, por clases." }]);
  });

  it("excludes a sibling staffed gym's FAQs (scoped to the operator's gym-in-effect)", async () => {
    const fake = makeFake({
      rows: [
        { id: "q1", gym_id: "gym-1", question: "¿Q?", answer: "A", sort_order: 0 },
        { id: "sibling", gym_id: "gym-2", question: "¿Ajeno?", answer: "B", sort_order: 0 },
      ],
    });
    const list = await listFaqs(fake.client);
    expect(list.map((f) => f.id)).toEqual(["q1"]);
  });

  it("crearFaq appends sort_order = 0 when the gym has no existing rows", async () => {
    const fake = makeFake({ rows: [] });
    await crearFaq({ question: "¿Hay estacionamiento?", answer: "Sí, gratuito." }, fake.client);
    expect(fake.calls.insert).toEqual({
      gym_id: "gym-1",
      question: "¿Hay estacionamiento?",
      answer: "Sí, gratuito.",
      sort_order: 0,
    });
  });

  it("crearFaq appends after the current last sort_order", async () => {
    const fake = makeFake({ rows: [{ id: "q1", sort_order: 2 }] });
    await crearFaq({ question: "¿Puedo congelar mi paquete?", answer: "Sí, hasta 30 días." }, fake.client);
    expect(fake.calls.insert?.sort_order).toBe(3);
  });

  it("actualizarFaq sends the exact update payload for the given id", async () => {
    const fake = makeFake();
    await actualizarFaq({ id: ID, question: "¿Q?", answer: "A" }, fake.client);
    expect(fake.calls.updates).toEqual([{ id: ID, payload: { question: "¿Q?", answer: "A" } }]);
  });

  it("actualizarFaq throws 'no encontrada' when the update affects 0 rows (RLS hid it)", async () => {
    const fake = makeFake({ updateData: [] });
    await expect(actualizarFaq({ id: ID, question: "x", answer: "y" }, fake.client)).rejects.toThrow(
      "Pregunta no encontrada",
    );
  });

  it("eliminarFaq deletes by id", async () => {
    const fake = makeFake();
    await eliminarFaq({ id: ID }, fake.client);
    expect(fake.calls.deletes).toEqual([ID]);
  });

  it("eliminarFaq throws 'no encontrada' when the delete affects 0 rows (RLS hid it)", async () => {
    const fake = makeFake({ deleteData: [] });
    await expect(eliminarFaq({ id: ID }, fake.client)).rejects.toThrow("Pregunta no encontrada");
  });

  it("reordenarFaqs sets sort_order = index for every id in order", async () => {
    const fake = makeFake();
    const [a, b, c] = [
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222",
      "33333333-3333-4333-8333-333333333333",
    ];
    await reordenarFaqs({ ids: [a, b, c] }, fake.client);
    expect(fake.calls.updates).toEqual([
      { id: a, payload: { sort_order: 0 } },
      { id: b, payload: { sort_order: 1 } },
      { id: c, payload: { sort_order: 2 } },
    ]);
  });

  it("rejects an empty question (zod) before any write", async () => {
    const fake = makeFake();
    await expect(crearFaq({ question: "  ", answer: "x" }, fake.client)).rejects.toThrow();
    expect(fake.calls.insert).toBeUndefined();
  });

  it("rejects an over-length answer (zod) before any write", async () => {
    const fake = makeFake();
    await expect(crearFaq({ question: "X", answer: "a".repeat(1001) }, fake.client)).rejects.toThrow();
    expect(fake.calls.insert).toBeUndefined();
  });

  it("throws 'No autenticado' when getClaims returns no sub", async () => {
    const fake = makeFake({ sub: null });
    await expect(crearFaq({ question: "X", answer: "y" }, fake.client)).rejects.toThrow("No autenticado");
    expect(fake.calls.insert).toBeUndefined();
  });
});

describe("gym-content DAL — stat write orchestration (injected fake)", () => {
  it("listStats maps rows -> StatDTO[]", async () => {
    const fake = makeFake({ rows: [{ id: "s1", gym_id: "gym-1", label: "Miembros activos", value: "500+", sort_order: 0 }] });
    const list = await listStats(fake.client);
    expect(list).toEqual([{ id: "s1", label: "Miembros activos", value: "500+" }]);
  });

  it("excludes a sibling staffed gym's stats (scoped to the operator's gym-in-effect)", async () => {
    const fake = makeFake({
      rows: [
        { id: "s1", gym_id: "gym-1", label: "Miembros activos", value: "500+", sort_order: 0 },
        { id: "sibling", gym_id: "gym-2", label: "Ajeno", value: "1", sort_order: 0 },
      ],
    });
    const list = await listStats(fake.client);
    expect(list.map((s) => s.id)).toEqual(["s1"]);
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

// ── anon public reads (moved from marketing.test.ts — same gym-scoped-filter fake shape the rest
// of that file's public-read tests use, kept local here since this file owns the anon twins now) ──

interface PublicTableRows {
  about_value?: Record<string, unknown>[];
  facility?: Record<string, unknown>[];
  faq?: Record<string, unknown>[];
  stat?: Record<string, unknown>[];
}

interface EqCall {
  table: string;
  col: string;
  val: unknown;
}

function makeAnonFake(rows: PublicTableRows): { client: SupabaseServer; eqCalls: EqCall[] } {
  const eqCalls: EqCall[] = [];

  const client = {
    from: (table: string) => {
      const list = (rows as Record<string, Record<string, unknown>[]>)[table] ?? [];
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (col: string, val: unknown) => {
          eqCalls.push({ table, col, val });
          return builder;
        },
        order: async () => ({ data: list, error: null }),
      };
      return builder;
    },
  };

  return { client: client as unknown as SupabaseServer, eqCalls };
}

const GYM = "gym-red-demo";

describe("gym-content DAL — public anon reads", () => {
  it("getValoresPublicos maps the three values and scopes the read to the gym", async () => {
    const fake = makeAnonFake({
      about_value: [
        { id: "v1", title: "Fuerza", description: "La base de todo." },
        { id: "v2", title: "Disciplina", description: "Te trae a las 05:30." },
      ],
    });
    const valores = await getValoresPublicos(GYM, fake.client);
    expect(valores).toEqual([
      { id: "v1", title: "Fuerza", description: "La base de todo." },
      { id: "v2", title: "Disciplina", description: "Te trae a las 05:30." },
    ]);
    expect(fake.eqCalls).toEqual([{ table: "about_value", col: "gym_id", val: GYM }]);
  });

  it("getInstalacionesPublicas maps rows and scopes the read to the gym", async () => {
    const fake = makeAnonFake({
      facility: [{ id: "f1", name: "Racks y barras", description: "12 estaciones" }],
    });
    const facs = await getInstalacionesPublicas(GYM, fake.client);
    expect(facs).toEqual([{ id: "f1", name: "Racks y barras", description: "12 estaciones" }]);
    expect(fake.eqCalls).toEqual([{ table: "facility", col: "gym_id", val: GYM }]);
  });

  it("getFaqsPublicas maps rows and scopes the read to the gym", async () => {
    const fake = makeAnonFake({
      faq: [{ id: "q1", question: "¿Puedo congelar?", answer: "Sí." }],
    });
    const faqs = await getFaqsPublicas(GYM, fake.client);
    expect(faqs).toEqual([{ id: "q1", question: "¿Puedo congelar?", answer: "Sí." }]);
    expect(fake.eqCalls).toEqual([{ table: "faq", col: "gym_id", val: GYM }]);
  });

  it("getStatsPublicas maps the label/value pairs and scopes the read to the gym", async () => {
    const fake = makeAnonFake({
      stat: [{ id: "s1", label: "Coaches", value: "3" }],
    });
    const stats = await getStatsPublicas(GYM, fake.client);
    expect(stats).toEqual([{ id: "s1", label: "Coaches", value: "3" }]);
    expect(fake.eqCalls).toEqual([{ table: "stat", col: "gym_id", val: GYM }]);
  });
});

interface HorarioCalls {
  upsert?: { payload: Record<string, unknown>; config: unknown };
}

/** `actualizarHorario` writes a DIFFERENT table (`gym_contact`) than the shared `makeFake` above
 *  and via `.upsert()`, not `.update()` — its own small fake, mirroring legal.test.ts's
 *  `fakeActualizarIdentidad`. */
function fakeActualizarHorario(opts: {
  sub?: string | null;
  upsertError?: unknown;
}): { client: SupabaseServer; calls: HorarioCalls } {
  const sub = opts.sub === undefined ? "op-1" : opts.sub;
  const calls: HorarioCalls = {};
  const client = {
    auth: { getClaims: async () => ({ data: sub ? { claims: { sub } } : null }) },
    from: (table: string) => {
      if (table === "gym_membership") {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                order: async () => ({
                  data: [{ gym_id: "gym-1", gym: { timezone: "America/Chihuahua", slug: "forge", brand_name: "Forge" } }],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "gym_contact") {
        return {
          upsert: (payload: Record<string, unknown>, config: unknown) => {
            calls.upsert = { payload, config };
            return Promise.resolve({ error: opts.upsertError ?? null });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { client: client as unknown as SupabaseServer, calls };
}

describe("actualizarHorario", () => {
  it("upserts gym_contact with the exact gym_id/hours_text payload, onConflict gym_id", async () => {
    const fake = fakeActualizarHorario({});
    await actualizarHorario({ horario: "Lun-Vie 6:00-21:00, Sáb 8:00-14:00" }, fake.client);
    expect(fake.calls.upsert).toEqual({
      payload: { gym_id: "gym-1", hours_text: "Lun-Vie 6:00-21:00, Sáb 8:00-14:00" },
      config: { onConflict: "gym_id" },
    });
  });

  it("a blank input clears the field (writes null, not an empty string)", async () => {
    const fake = fakeActualizarHorario({});
    await actualizarHorario({ horario: "   " }, fake.client);
    expect(fake.calls.upsert?.payload).toEqual({ gym_id: "gym-1", hours_text: null });
  });

  it("rejects a horario over 200 characters", async () => {
    const fake = fakeActualizarHorario({});
    await expect(actualizarHorario({ horario: "a".repeat(201) }, fake.client)).rejects.toThrow();
  });

  it("throws when unauthenticated", async () => {
    const fake = fakeActualizarHorario({ sub: null });
    await expect(actualizarHorario({ horario: "Lun-Sáb 6:00-21:00" }, fake.client)).rejects.toThrow(
      "No autenticado",
    );
  });

  it("throws when the upsert errors", async () => {
    const fake = fakeActualizarHorario({ upsertError: { message: "boom" } });
    await expect(actualizarHorario({ horario: "Lun-Sáb 6:00-21:00" }, fake.client)).rejects.toThrow(
      "No se pudo guardar el horario",
    );
  });
});
