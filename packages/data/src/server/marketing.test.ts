import { describe, expect, it } from "vitest";

import {
  getContacto,
  getFaqsPublicas,
  getMarketingGym,
  getPlanesPublicos,
  parseHorarios,
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
  gym_contact?: Record<string, unknown>[];
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

  it("getContacto maps the row (coercing numeric lat/long), parses hours, and scopes by gym_id", async () => {
    const fake = makeFake({
      gym_contact: [
        {
          address_line: "Av. de la Fragua 124",
          address_note: "Portón de acero",
          latitude: "25.686600", // Postgres numeric serializes as a string over PostgREST
          longitude: "-100.316100",
          whatsapp: "528112345678",
          email: "hola@red-demo.mx",
          instagram: "red.demo",
          hours: [
            { day: "Lunes", opens: "05:30", closes: "22:00" },
            { day: "Domingo", closed: true },
          ],
        },
      ],
    });
    const contacto = await getContacto(GYM, fake.client);
    expect(contacto).toEqual({
      addressLine: "Av. de la Fragua 124",
      addressNote: "Portón de acero",
      latitude: 25.6866,
      longitude: -100.3161,
      whatsapp: "528112345678",
      email: "hola@red-demo.mx",
      instagram: "red.demo",
      horarios: [
        { day: "Lunes", opens: "05:30", closes: "22:00", closed: false },
        { day: "Domingo", opens: null, closes: null, closed: true },
      ],
    });
    expect(fake.eqCalls).toEqual([{ table: "gym_contact", col: "gym_id", val: GYM }]);
  });

  it("getContacto returns null when no gym_contact row exists", async () => {
    const fake = makeFake({ gym_contact: [] });
    expect(await getContacto(GYM, fake.client)).toBeNull();
  });

  it("parseHorarios skips malformed entries and non-arrays", () => {
    expect(parseHorarios(null)).toEqual([]);
    expect(parseHorarios("nope")).toEqual([]);
    expect(
      parseHorarios([
        { day: "Lunes", opens: "05:30", closes: "22:00" },
        { opens: "07:00" }, // no day → skipped
        { day: "Domingo", closed: true },
      ]),
    ).toEqual([
      { day: "Lunes", opens: "05:30", closes: "22:00", closed: false },
      { day: "Domingo", opens: null, closes: null, closed: true },
    ]);
  });
});
