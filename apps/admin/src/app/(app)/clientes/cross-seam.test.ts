import { describe, expect, it } from "vitest";

import { getClientesRoster, getRosterResumen } from "@gym/data/server/clientes";
import type { SupabaseServer } from "@gym/data/server/supabase";
import { addDays, hoyEnZona, toIsoDay } from "@gym/format";
import { derivarVistaRoster } from "./_components/clientes-vm";

/**
 * #228 opus review F6 — the cross-seam equality machine guard: the SAME `clientes`
 * rows read through INICIO's `getRosterResumen` (packages/data) and through
 * CLIENTES' `getClientesRoster` → `derivarVistaRoster` (the vm) must report the
 * SAME `vigentes`/`porRenovar.total` — the "VIGENTES card and directory header
 * agree" AC (#228), and the "por renovar means one thing everywhere" AC (#222
 * story 4), caught by a test instead of relying on review to notice a future
 * drift. Lives HERE, not under `_components/`: the ESLint client-seam guard
 * (eslint.config.mjs, ADR-0011 §6) restricts every `_components/**` file — test
 * files included — to TYPE-ONLY imports of `@gym/data/server/*`, since it can't
 * tell a vitest-only file from one a client bundle would pull in. This file
 * sits beside `page.tsx` (also a value-importer of the DAL) instead.
 *
 * A minimal hand-rolled Supabase fake (this file can't import packages/data's
 * own test-only fake — it isn't in @gym/data's exports allow-list, ADR-0011 §4)
 * seeds ONE shared row set for both reads.
 */
describe("cross-seam equality — getRosterResumen agrees with getClientesRoster→derivarVistaRoster (#228 F6)", () => {
  const TZ = "America/Chihuahua";
  const HOY = hoyEnZona(TZ);

  const SHARED_CLIENTES = [
    {
      id: "c-hoy",
      gym_id: "g-1",
      nombre: "Vence Hoy",
      tel: null,
      paquete_nombre: "8 clases",
      clases_restantes: 8,
      vence: toIsoDay(HOY), // dias === 0 → POR RENOVAR
      email: null,
      invitacion_enviada_at: null,
      auth_user_id: null,
      created_at: "2026-01-01T00:00:00Z", // #226 F5: getClientesRoster now reads this for altaIso
    },
    {
      id: "c-lejos",
      gym_id: "g-1",
      nombre: "Vigente Lejos",
      tel: null,
      paquete_nombre: "8 clases",
      clases_restantes: 8,
      vence: toIsoDay(addDays(HOY, 30)), // vigente, outside POR RENOVAR
      email: null,
      invitacion_enviada_at: null,
      auth_user_id: null,
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "c-vencido",
      gym_id: "g-1",
      nombre: "Ya Vencido",
      tel: null,
      paquete_nombre: "8 clases",
      clases_restantes: 5,
      vence: toIsoDay(addDays(HOY, -5)), // vencido — never vigente, never POR RENOVAR
      email: null,
      invitacion_enviada_at: null,
      auth_user_id: null,
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "c-clases",
      gym_id: "g-1",
      nombre: "Clase Bound",
      tel: null,
      paquete_nombre: "8 clases",
      clases_restantes: 1, // clases-bound POR RENOVAR, still vigente
      vence: toIsoDay(addDays(HOY, 18)),
      email: null,
      invitacion_enviada_at: null,
      auth_user_id: null,
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "c-online",
      gym_id: "g-1",
      nombre: "Online Fresco",
      tel: null,
      paquete_nombre: null,
      clases_restantes: null,
      vence: null, // sin_paquete — never vigente, never POR RENOVAR
      email: null,
      invitacion_enviada_at: null,
      auth_user_id: "auth-online-1",
      created_at: "2026-01-01T00:00:00Z",
    },
  ];

  /** A minimal chain-capturing fake covering exactly what getRosterResumen and
   *  getClientesRoster read: `clientes`/`paquetes` selects, the `gym_membership`
   *  embed getOperatorGym resolves, and the asistencias-count RPC (unused by
   *  either function's estado/porRenovar math, seeded empty). */
  function makeSharedFake(clientes: Record<string, unknown>[]): SupabaseServer {
    function builder(table: string, list: Record<string, unknown>[]) {
      let filtered = [...list];
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (col: string, val: unknown) => {
          filtered = filtered.filter((r) => r[col] === val);
          return b;
        },
        in: (col: string, vals: unknown[]) => {
          filtered = filtered.filter((r) => vals.includes(r[col]));
          return b;
        },
        order: () => b,
        then: (resolve: (v: { data: unknown; error: null }) => unknown) =>
          resolve({ data: filtered, error: null }),
      };
      return b;
    }
    const client = {
      auth: { getClaims: async () => ({ data: { claims: { sub: "op-1" } } }) },
      from: (table: string) => {
        if (table === "gym_membership") {
          return builder(table, [
            { gym_id: "g-1", role: "operator", gym: { timezone: TZ, slug: "forge", brand_name: "Forge" } },
          ]);
        }
        if (table === "clientes") return builder(table, clientes);
        return builder(table, []); // paquetes: empty catalog — no pase suelto in this fixture
      },
      rpc: () => ({
        then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
          resolve({ data: [], error: null }),
      }),
    };
    return client as unknown as SupabaseServer;
  }

  it("vigentes and porRenovar.total match across both reads for the SAME roster", async () => {
    const resumen = await getRosterResumen(makeSharedFake(SHARED_CLIENTES));
    const roster = await getClientesRoster(makeSharedFake(SHARED_CLIENTES));
    const { conteos } = derivarVistaRoster(roster);

    expect(resumen.vigentes).toBe(3); // c-hoy + c-lejos + c-clases
    expect(resumen.porRenovar.total).toBe(2); // c-hoy (día) + c-clases (clases)
    expect(resumen.total).toBe(5);

    expect(conteos.vigentes).toBe(resumen.vigentes);
    expect(conteos.porRenovar.total).toBe(resumen.porRenovar.total);
    expect(conteos.total).toBe(resumen.total);
  });

  /**
   * #229's own "same word, same number" guard: c-vencido (vence 5 días ago, no
   * `auth_user_id`) is INICIO's AÚN A TIEMPO population — this proves the tile's
   * count (`getRosterResumen.aunATiempo.total`) equals BOTH the directory
   * view-model's shared count (`conteos.aunATiempo.total`, #228 F6's own guard,
   * widened) AND the actual cardinality of the filtered row set
   * (`filas.filter(f => f.aunATiempo)`) — the count and the rows a tap on the
   * tile lands on can never disagree (spec story 19).
   */
  it("aunATiempo.total matches across both reads, and equals the filtered row set's own cardinality", async () => {
    const resumen = await getRosterResumen(makeSharedFake(SHARED_CLIENTES));
    const roster = await getClientesRoster(makeSharedFake(SHARED_CLIENTES));
    const { filas, conteos } = derivarVistaRoster(roster);

    expect(resumen.aunATiempo.total).toBe(1); // c-vencido — vencido 5 días, no app account
    expect(conteos.aunATiempo.total).toBe(resumen.aunATiempo.total);

    const filtered = filas.filter((f) => f.aunATiempo);
    expect(filtered).toHaveLength(resumen.aunATiempo.total);
    expect(filtered.map((f) => f.c.id)).toEqual(["c-vencido"]);
  });
});
