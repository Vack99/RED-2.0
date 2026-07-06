import { describe, expect, it } from "vitest";

import {
  getCoachesPublicos,
  getFaqsPublicas,
  getFormatosPublicos,
  getInstalacionesPublicas,
  getMarketingGym,
  getPlanesPublicos,
  getStatsPublicas,
  getValoresPublicos,
} from "./marketing";
import type { SupabaseServer } from "./supabase";

/**
 * The public-marketing readers map anon rows → DTOs and SCOPE every read to one gym id. RLS itself (anon
 * can read the catalog, gym-scoping is a query concern) is proven against the real schema in
 * supabase/tests/anon_catalog_read.sql; here we assert the mapping, the fallback, the feature grouping,
 * and that every read filters by gym_id (the only isolation the anon `using (true)` policy leaves to the
 * app). A chain-recording fake stands in for the injected client (ADR-0001).
 */
interface TableRows {
  gym?: Record<string, unknown>[];
  paquetes?: Record<string, unknown>[];
  plan_feature?: Record<string, unknown>[];
  faq?: Record<string, unknown>[];
  about_value?: Record<string, unknown>[];
  facility?: Record<string, unknown>[];
  stat?: Record<string, unknown>[];
  coach?: Record<string, unknown>[];
  class_type?: Record<string, unknown>[];
}

interface EqCall {
  table: string;
  col: string;
  val: unknown;
}

function makeFake(rows: TableRows): { client: SupabaseServer; eqCalls: EqCall[] } {
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
        maybeSingle: async () => ({ data: list[0] ?? null, error: null }),
      };
      return builder;
    },
  };

  return { client: client as unknown as SupabaseServer, eqCalls };
}

const GYM = "gym-red-demo";

describe("marketing DAL — public anon reads", () => {
  it("getMarketingGym maps the row and filters by slug", async () => {
    const fake = makeFake({ gym: [{ id: GYM, brand_name: "RED Demo" }] });
    const gym = await getMarketingGym("red-demo", fake.client);
    expect(gym).toEqual({ id: GYM, brandName: "RED Demo" });
    expect(fake.eqCalls).toEqual([{ table: "gym", col: "slug", val: "red-demo" }]);
  });

  it("getMarketingGym returns null for an unknown slug", async () => {
    const fake = makeFake({ gym: [] });
    expect(await getMarketingGym("no-such-gym", fake.client)).toBeNull();
  });

  it("getPlanesPublicos maps marketing copy, groups features by plan, and scopes both reads to the gym", async () => {
    const fake = makeFake({
      paquetes: [
        {
          id: "p1",
          nombre: "8 clases",
          precio: 700,
          popular: false,
          orden: 0,
          name: "Ocho clases",
          subtitle: "El plan estándar",
          badge: "Estándar",
          cadence: "/ al mes",
        },
        {
          id: "p2",
          nombre: "Ilimitado",
          precio: 1400,
          popular: true,
          orden: 1,
          name: null,
          subtitle: null,
          badge: "Más popular",
          cadence: "/ al mes",
        },
      ],
      plan_feature: [
        { plan_id: "p1", label: "8 clases al mes", orden: 0 },
        { plan_id: "p1", label: "Reserva desde la app", orden: 1 },
        { plan_id: "p2", label: "Clases ilimitadas", orden: 0 },
      ],
    });

    const planes = await getPlanesPublicos(GYM, fake.client);

    expect(planes).toEqual([
      {
        id: "p1",
        name: "Ocho clases",
        subtitle: "El plan estándar",
        precio: 700,
        cadence: "/ al mes",
        badge: "Estándar",
        popular: false,
        features: ["8 clases al mes", "Reserva desde la app"],
      },
      {
        id: "p2",
        name: "Ilimitado", // falls back to the grant-derived nombre when marketing name is null
        subtitle: null,
        precio: 1400,
        cadence: "/ al mes",
        badge: "Más popular",
        popular: true,
        features: ["Clases ilimitadas"],
      },
    ]);
    // Both the paquetes AND the plan_feature read must be gym-scoped (the anon policy is flat).
    expect(fake.eqCalls).toEqual([
      { table: "paquetes", col: "gym_id", val: GYM },
      { table: "plan_feature", col: "gym_id", val: GYM },
    ]);
  });

  it("getPlanesPublicos returns [] when the paquetes read yields no rows", async () => {
    const fake = makeFake({ paquetes: [] as Record<string, unknown>[] });
    // paquetes read resolves to [] (not null) here, so it maps to an empty catalog.
    expect(await getPlanesPublicos(GYM, fake.client)).toEqual([]);
  });

  it("getFaqsPublicas maps rows and scopes the read to the gym", async () => {
    const fake = makeFake({
      faq: [{ id: "q1", question: "¿Puedo congelar?", answer: "Sí." }],
    });
    const faqs = await getFaqsPublicas(GYM, fake.client);
    expect(faqs).toEqual([{ id: "q1", question: "¿Puedo congelar?", answer: "Sí." }]);
    expect(fake.eqCalls).toEqual([{ table: "faq", col: "gym_id", val: GYM }]);
  });

  it("getValoresPublicos maps the three values and scopes the read to the gym", async () => {
    const fake = makeFake({
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
    const fake = makeFake({
      facility: [{ id: "f1", name: "Racks y barras", description: "12 estaciones" }],
    });
    const facs = await getInstalacionesPublicas(GYM, fake.client);
    expect(facs).toEqual([{ id: "f1", name: "Racks y barras", description: "12 estaciones" }]);
    expect(fake.eqCalls).toEqual([{ table: "facility", col: "gym_id", val: GYM }]);
  });

  it("getStatsPublicas maps the label/value pairs and scopes the read to the gym", async () => {
    const fake = makeFake({
      stat: [{ id: "s1", label: "Coaches", value: "3" }],
    });
    const stats = await getStatsPublicas(GYM, fake.client);
    expect(stats).toEqual([{ id: "s1", label: "Coaches", value: "3" }]);
    expect(fake.eqCalls).toEqual([{ table: "stat", col: "gym_id", val: GYM }]);
  });

  it("getCoachesPublicos maps every field (nullable bio/specialty), filters to active + gym", async () => {
    const fake = makeFake({
      coach: [
        {
          id: "c1",
          name: "Marisa Peña",
          initials: "MP",
          role: "Coach",
          specialty: "Fuerza",
          bio: "Diseña los metcons.",
        },
        { id: "c2", name: "Paty Ruiz", initials: "PR", role: "Coach", specialty: null, bio: null },
      ],
    });
    const coaches = await getCoachesPublicos(GYM, fake.client);
    expect(coaches).toEqual([
      {
        id: "c1",
        name: "Marisa Peña",
        initials: "MP",
        role: "Coach",
        specialty: "Fuerza",
        bio: "Diseña los metcons.",
      },
      { id: "c2", name: "Paty Ruiz", initials: "PR", role: "Coach", specialty: null, bio: null },
    ]);
    // Roster is gym-scoped AND limited to active coaches (anon `using(true)` shows all rows).
    expect(fake.eqCalls).toEqual([
      { table: "coach", col: "gym_id", val: GYM },
      { table: "coach", col: "is_active", val: true },
    ]);
  });

  it("getFormatosPublicos maps class types (nullable level/description/duration) scoped to the gym", async () => {
    const fake = makeFake({
      class_type: [
        {
          id: "t1",
          name: "Fuerza",
          level: "Todos los niveles",
          description: null,
          default_duration_min: 60,
        },
        {
          id: "t2",
          name: "Open",
          level: null,
          description: "Entrena a tu ritmo",
          default_duration_min: null,
        },
      ],
    });
    const formatos = await getFormatosPublicos(GYM, fake.client);
    expect(formatos).toEqual([
      { id: "t1", name: "Fuerza", level: "Todos los niveles", description: null, durationMin: 60 },
      { id: "t2", name: "Open", level: null, description: "Entrena a tu ritmo", durationMin: null },
    ]);
    expect(fake.eqCalls).toEqual([{ table: "class_type", col: "gym_id", val: GYM }]);
  });
});
