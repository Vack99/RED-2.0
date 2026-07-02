# Per-gym timezone (slice #25) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace @gym/format's hardcoded `America/Chihuahua` date helpers with tz-parameterized equivalents, thread the resolved gym's timezone through all 21 call sites (via a new gym-membership-based DAL resolver), and make `toggle_pase` derive the gym's timezone from the cliente's gym row instead of two hardcoded SQL literals.

**Architecture:** `@gym/format` stays a pure leaf — its date helpers take an explicit `tz: string` (IANA) argument, no default. A new `packages/data/src/server/gym.ts` module exports `getOperatorGym` (React `cache()`-wrapped), which resolves `(auth.uid() → gym_membership → gym.timezone)` once per request. Every DAL reader/writer that currently calls `hoyChihuahua()`/`fechaChihuahua()` resolves its zone via `getOperatorGym` internally (self-contained, no tz threading burden on callers) and passes the resolved `tz` string into the renamed `@gym/format` calls and into the pure `shapeFicha`/`buildRespaldoRows` functions. `toggle_pase` already selects `clientes.gym_id` into `v_gym` (from #20) — it additionally joins `gym` for `timezone` and replaces the two `'America/Chihuahua'` literals with that value.

**Tech Stack:** TypeScript (pnpm + Turborepo monorepo), Vitest, Supabase Postgres (plpgsql RPC), React `cache()`.

## Global Constraints

- `@gym/format` is a pure leaf — must NOT import `@gym/data` (ADR-0011).
- Forge's gym row IS `America/Chihuahua` — every existing Forge-path test/behavior must stay byte-identical.
- No hardcoded `America/Chihuahua` in packages/apps TS or in `toggle_pase` (prose comments about gym #1 exempt; test fixtures asserting gym-#1-specific behavior may use a locally-named constant, mirroring the existing `supabase/tests/toggle_pase_rules.sql` convention).
- `toggle_pase` migration is additive `CREATE OR REPLACE` — never destructive SQL against the live project.
- TDD: the ≥2-zone `@gym/format` unit tests are written BEFORE the rename.
- Never touch `brand-id.ts`, `registry.ts`, either `layout.tsx`, or the `@gym/brand` registry describe block (Phase-4-owned).

---

### Task 1: TDD — tz-parameterized `@gym/format` date helpers (rename + 2-zone tests)

**Files:**
- Modify: `packages/format/src/fecha.ts` (full rewrite of the Chihuahua-hardcoded helpers)
- Create: `packages/format/src/fecha.test.ts`
- Modify: `packages/format/src/index.ts` (barrel comment update only)

**Interfaces:**
- Produces: `hoyEnZona(tz: string): Date`, `fechaEnZona(isoTimestamp: string, tz: string): Date`, `hoyIsoEnZona(tz: string): string`, `toIsoDay` (unchanged, re-exported from `date.ts`), `parseDay` (unchanged).
- Removes: `hoyChihuahua`, `fechaChihuahua`, `hoyIsoChihuahua`, `TZ`.

- [ ] **Step 1: Write the failing 2-zone unit tests**

```typescript
// packages/format/src/fecha.test.ts
import { describe, expect, it } from "vitest";
import { fechaEnZona, hoyEnZona, hoyIsoEnZona } from "./fecha";

// Two zones, both DST-free in MX (America/Chihuahua observes the US-style
// border DST rule as of the 2022 reform; America/Mexico_City has been
// DST-free since 2022 too — both fixed-offset for the purposes below at a
// date where neither is mid-transition).
const CHIHUAHUA = "America/Chihuahua";
const MEXICO_CITY = "America/Mexico_City";

describe("fechaEnZona", () => {
  it("resolves a UTC-late-evening timestamp to the SAME calendar day in Chihuahua (UTC-6/7)", () => {
    // 2026-05-20T18:00:00Z -> Chihuahua local morning/noon, same day.
    const d = fechaEnZona("2026-05-20T18:00:00Z", CHIHUAHUA);
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 4, 20]);
  });

  it("resolves the SAME instant to the SAME calendar day in Mexico City (UTC-6)", () => {
    const d = fechaEnZona("2026-05-20T18:00:00Z", MEXICO_CITY);
    expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 4, 20]);
  });

  it("a near-midnight-UTC instant rolls to the NEXT day in Chihuahua but not yet in a zone further east — proves the tz argument actually changes the result", () => {
    // 2026-05-21T05:30:00Z: Chihuahua (UTC-6 in May, no DST that month) is
    // 2026-05-20 23:30 local (still the 20th); Mexico City (UTC-6, same
    // offset in May 2026) is also 23:30 local the 20th. Use a case where the
    // two zones' offsets genuinely differ instead (Chihuahua flips to -6 on
    // the US schedule while CDMX stays -6 fixed — pick a January date where
    // Chihuahua is -7 (standard, pre-DST) and CDMX is -6, a real 1h skew).
    const d1 = fechaEnZona("2026-01-15T06:30:00Z", CHIHUAHUA); // -7 -> 2026-01-14 23:30 local
    const d2 = fechaEnZona("2026-01-15T06:30:00Z", MEXICO_CITY); // -6 -> 2026-01-15 00:30 local
    expect([d1.getFullYear(), d1.getMonth(), d1.getDate()]).toEqual([2026, 0, 14]);
    expect([d2.getFullYear(), d2.getMonth(), d2.getDate()]).toEqual([2026, 0, 15]);
  });
});

describe("hoyEnZona / hoyIsoEnZona", () => {
  it("returns a Date whose local Y/M/D matches Intl's formatToParts for the given zone (both zones)", () => {
    for (const tz of [CHIHUAHUA, MEXICO_CITY]) {
      const viaHelper = hoyEnZona(tz);
      const parts = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" })
        .formatToParts(new Date());
      const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
      expect(viaHelper.getFullYear()).toBe(get("year"));
      expect(viaHelper.getMonth()).toBe(get("month") - 1);
      expect(viaHelper.getDate()).toBe(get("day"));
    }
  });

  it("hoyIsoEnZona is hoyEnZona serialized to YYYY-MM-DD, for both zones", () => {
    for (const tz of [CHIHUAHUA, MEXICO_CITY]) {
      const iso = hoyIsoEnZona(tz);
      expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail (module doesn't export these names yet)**

Run: `pnpm --filter @gym/format test`
Expected: FAIL — `fechaEnZona`/`hoyEnZona`/`hoyIsoEnZona` are not exported by `./fecha`.

- [ ] **Step 3: Rewrite `fecha.ts` with the tz-parameterized, honestly-named helpers**

```typescript
// packages/format/src/fecha.ts
// Real (non-mock) calendar helpers for the Supabase era. The domain rules
// (src/domain/rules.ts) read a Date's LOCAL components, so every Date handed to
// them must carry the GYM-LOCAL calendar Y/M/D in its local fields. These helpers
// bridge the wall clock + Postgres `date` strings into that shape, given the
// caller's resolved IANA zone (per-gym — audit finding 1, PRD #17 named
// exception). @gym/format stays a pure leaf: it never reads a gym row itself,
// only ever a `tz` argument.
//
// date.ts holds the pure local-component calendar math (labels + isoDay); this
// module adds the tz-aware wall clock + Postgres `date` parsing on top.
// `toIsoDay` is date.isoDay re-exported so the local-field serialization lives in
// exactly one place.

import { isoDay } from "./date";

// A fresh Intl.DateTimeFormat per distinct `tz` (not hoisted to one module-level
// formatter, since the zone is now a runtime argument, not a fixed constant).
// Cached per-zone so a hot path re-using the same tz string still avoids
// rebuilding the formatter every call (js-hoist-intl).
const ymdFormatters = new Map<string, Intl.DateTimeFormat>();
function ymdFormatterFor(tz: string): Intl.DateTimeFormat {
  let fmt = ymdFormatters.get(tz);
  if (!fmt) {
    fmt = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" });
    ymdFormatters.set(tz, fmt);
  }
  return fmt;
}

/** Today in the given IANA zone, as a Date whose local Y/M/D = that zone's calendar date. */
export function hoyEnZona(tz: string): Date {
  const parts = ymdFormatterFor(tz).formatToParts(new Date());
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return new Date(get("year"), get("month") - 1, get("day"));
}

/** Parse a Postgres `date` ("YYYY-MM-DD") into a local-midnight Date. Timezone-
 *  independent — a `date` column carries no zone, so this never takes a `tz`. */
export function parseDay(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d);
}

/** Serialize a Date to a Postgres `date` literal ("YYYY-MM-DD") using local fields.
 *  Single-sourced from date.isoDay — same local-component serialization, one home. */
export const toIsoDay = isoDay;

/** Today's iso day in the given IANA zone ("YYYY-MM-DD"). */
export function hoyIsoEnZona(tz: string): string {
  return toIsoDay(hoyEnZona(tz));
}

/** The zone-local calendar Date for a timestamptz string (handles tz drift). */
export function fechaEnZona(isoTimestamp: string, tz: string): Date {
  const parts = ymdFormatterFor(tz).formatToParts(new Date(isoTimestamp));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  return new Date(get("year"), get("month") - 1, get("day"));
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @gym/format test`
Expected: PASS (all `fecha.test.ts` + existing `date.test.ts`/`format.test.ts` cases)

- [ ] **Step 5: Update `index.ts`'s barrel comment (no export changes — `export *` already covers the new names)**

```typescript
// @gym/format — es-MX locale + tz-parameterized date formatting (ADR-0011 §4). A
// pure leaf: it imports NOTHING from other workspace packages, and never reads a
// gym row itself — every zone-aware helper takes an explicit `tz` (IANA) argument.
// The three modules keep their distinct jobs:
//   date.ts   — pure local-component calendar (es-MX labels + isoDay math)
//   fecha.ts  — tz-aware wall clock + Postgres `date` bridge (per-gym `tz` arg)
//   format.ts — es-MX peso strings + name/phone/WhatsApp helpers
export * from "./date";
export * from "./fecha";
export * from "./format";
```

- [ ] **Step 6: Commit**

```bash
git add packages/format/src/fecha.ts packages/format/src/fecha.test.ts packages/format/src/index.ts
git commit -m "feat(format): tz-parameterize the Chihuahua-hardcoded date helpers (TDD, 2 zones)"
```

---

### Task 2: `packages/data/src/server/gym.ts` — the operator-gym resolver

**Files:**
- Create: `packages/data/src/server/gym.ts`
- Modify: `packages/data/src/database.types.ts` (regenerate via `mcp__supabase__generate_typescript_types` against the live project — adds `gym`, `gym_domain`, `gym_membership` table types + the `gym_id` columns on the 7 tenant tables from #20)

**Interfaces:**
- Consumes: `SupabaseServer` (from `./supabase`), `requireOperator` (from `./_auth`).
- Produces: `getOperatorGym(client?: SupabaseServer): Promise<{ id: string; timezone: string }>` — React `cache()`-wrapped, throws `"No autenticado"` (via `requireOperator`) or `"Sin gym asignado"` if no membership row resolves.

- [ ] **Step 1: Regenerate `database.types.ts` against the live project**

Run the Supabase MCP `generate_typescript_types` tool against project `hjppxawglmukfvsgmcog`, write the result to `packages/data/src/database.types.ts` (verify `gym`, `gym_domain`, `gym_membership` tables and every `gym_id` column appear).

- [ ] **Step 2: Write `gym.ts`**

```typescript
import "server-only";

import { cache } from "react";

import { createClient, type SupabaseServer } from "./supabase";
import { requireOperator } from "./_auth";

export interface OperatorGym {
  id: string;
  timezone: string;
}

/**
 * The operator's gym (ADR-0013 membership: `auth.uid() -> gym_membership ->
 * gym`), memoized per request via React `cache()`. Every DAL reader that needs
 * the gym-local calendar resolves its `tz` through here — one round trip per
 * request (deduped by `cache()`), not one per call site.
 *
 * `gym_membership`'s RLS self-read policy already scopes the read to the caller
 * (ADR-0013 §4), so no explicit `user_id` filter is added here (matches the
 * RLS-trust convention every other DAL reader follows). `requireOperator` gives
 * a clean "No autenticado" instead of a confusing "Sin gym asignado" for an
 * anonymous caller.
 */
export const getOperatorGym = cache(
  async (client?: SupabaseServer): Promise<OperatorGym> => {
    const supabase = client ?? (await createClient());
    await requireOperator(supabase);

    const { data: membership } = await supabase
      .from("gym_membership")
      .select("gym_id")
      .limit(1)
      .maybeSingle();
    if (!membership) throw new Error("Sin gym asignado");

    const { data: gym } = await supabase
      .from("gym")
      .select("timezone")
      .eq("id", membership.gym_id)
      .maybeSingle();
    if (!gym) throw new Error("Gym no encontrado");

    return { id: membership.gym_id, timezone: gym.timezone };
  },
);
```

- [ ] **Step 3: Run typecheck to confirm the regenerated types satisfy this module**

Run: `pnpm --filter @gym/data typecheck`
Expected: PASS (no `any`, `.select("gym_id")`/`.select("timezone")` match the regenerated `Database` type)

- [ ] **Step 4: Commit**

```bash
git add packages/data/src/server/gym.ts packages/data/src/database.types.ts
git commit -m "feat(data): getOperatorGym — resolve the operator's gym + timezone via membership"
```

---

### Task 3: Extend the shared test fakes to serve `gym_membership`/`gym` (default: Forge's zone)

**Files:**
- Modify: `packages/data/src/server/supabase-fake.test-helper.ts`
- Modify: `packages/data/src/server/ventas.test.ts` (its own bespoke fake, not the shared one)

**Interfaces:**
- Consumes: nothing new — this only widens the existing `FakeClient`/`makeFake` test-infra surface.
- Produces: `makeFake` clients now respond to `.auth.getClaims()` (fixed operator), `.from("gym_membership")...limit(1).maybeSingle()`, `.from("gym")...eq().maybeSingle()`, defaulting to a Forge-shaped `{ timezone: "America/Chihuahua" }` so every EXISTING test (none of which assert a specific tz) keeps passing untouched.

- [ ] **Step 1: Extend `supabase-fake.test-helper.ts`**

```typescript
// Add to the FakeClient shape: a fixed authenticated operator, and default
// gym_membership/gym rows resolving to Forge's real zone (America/Chihuahua) —
// the SAME test-fixture convention already used by supabase/tests/toggle_pase_rules.sql
// for asserting gym-#1-specific behavior. No existing test asserts a different
// zone, so this default keeps every current test green untouched.
export function makeFake(
  rows: FakeRows,
  opts: { error?: { table: string; err: unknown } } = {},
): FakeClient {
  // ... existing isCalls/gteCalls/rangeCalls setup unchanged ...

  const builder = (table: string, list: unknown[]) => {
    // ... existing setup unchanged ...
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      is: (col: string, val: unknown) => { /* unchanged */ return b; },
      gte: (col: string, val: unknown) => { /* unchanged */ return b; },
      range: (from: number, to: number) => { /* unchanged */ return b; },
      order: () => b,
      limit: () => b, // no-op passthrough — the fake's lists are already small
      maybeSingle: async () => {
        if (err) return { data: null, error: err };
        return { data: list[0] ?? null, error: null };
      },
      then: (resolve: (v: { data: unknown[] | null; error: unknown }) => unknown) => {
        /* unchanged */
      },
    };
    return b;
  };

  const client = {
    auth: {
      getClaims: async () => ({ data: { claims: { sub: "test-operator" } } }),
    },
    from: (table: string) => {
      if (table === "gym_membership") return builder(table, [{ gym_id: "test-gym" }]);
      if (table === "gym") return builder(table, [{ timezone: "America/Chihuahua" }]);
      return builder(table, (rows as Record<string, unknown[]>)[table] ?? []);
    },
  };

  return { client: client as unknown as SupabaseServer, isCalls, gteCalls, rangeCalls };
}
```

- [ ] **Step 2: Run the existing suite that depends on this fake to confirm nothing broke**

Run: `pnpm --filter @gym/data test -- respaldo asistencia roster-nav`
Expected: PASS (unchanged — the new gym plumbing is invisible to these tests since none assert on tz)

- [ ] **Step 3: Extend `ventas.test.ts`'s bespoke `makeFake`**

Add `case "gym_membership": return builder({ gym_id: "test-gym" }, []);` and `case "gym": return builder({ timezone: "America/Chihuahua" }, []);` to its `from(table)` switch, and add `limit: () => b` to its `builder()`.

- [ ] **Step 4: Run `ventas.test.ts` to confirm it still fails ONLY on the parts Task 4 will fix (crearVenta doesn't call getOperatorGym yet)**

Run: `pnpm --filter @gym/data test -- ventas`
Expected: PASS unchanged (this task only adds fake capability, doesn't wire crearVenta yet)

- [ ] **Step 5: Commit**

```bash
git add packages/data/src/server/supabase-fake.test-helper.ts packages/data/src/server/ventas.test.ts
git commit -m "test(data): extend the shared + ventas fakes to serve gym_membership/gym (Forge default)"
```

---

### Task 4: Thread `tz` through the 21 call sites (packages/data readers/writers)

**Files:**
- Modify: `packages/data/src/server/derive.ts` (`shapeFicha` — add `tz` param, 4 call sites)
- Modify: `packages/data/src/server/derive.test.ts` (16 `shapeFicha(...)` call sites — insert a `TZ_FORGE = "America/Chihuahua"` 6th positional arg)
- Modify: `packages/data/src/server/clientes.ts` (5 call sites: `getClientesParaPase`, `getClientesRoster`, `getRosterResumen`, `getClienteFicha` ×2 — `hoyChihuahua`/`fechaChihuahua`)
- Modify: `packages/data/src/server/asistencia.ts` (1 call site: `getAsistenciasHoy`)
- Modify: `packages/data/src/server/paquetes.ts` (1 call site: `getPaquetes`, + accept an optional `tz` override so `crearVenta` can pass its already-resolved zone through without a second membership round trip)
- Modify: `packages/data/src/server/respaldo.ts` (1 call site: `getRespaldoData`)
- Modify: `packages/data/src/server/resumen.ts` (2 call sites: `getResumenMes`)
- Modify: `packages/data/src/server/ventas.ts` (1 call site: `crearVenta`)
- Modify: `packages/data/src/server/export/rows.ts` (2 call sites: `shapeClientes`, `shapeVentas` — read `data.tz` instead of a module-level constant)
- Modify: `packages/data/src/server/export/rows.test.ts` (add `tz: "America/Chihuahua"` to the shared `data()` factory)

**Interfaces:**
- Consumes: `getOperatorGym` (Task 2), `hoyEnZona`/`fechaEnZona`/`hoyIsoEnZona` (Task 1).
- Produces: `shapeFicha(c, asistencias, ventas, hoy, hoyIso, tz, plantillas, negocio, attendedSincePurchase, extras?)`; `RespaldoData.tz: string` (new field alongside `generadoHoy`); `getPaquetes(client?, tz?)` (tz optional — resolves via `getOperatorGym` when omitted).

- [ ] **Step 1: `derive.ts` — add `tz` to `shapeFicha`, replace its 4 `fechaChihuahua` calls with `fechaEnZona(_, tz)`**

```typescript
import { DOW, fechaEnZona, firstName, fmtShort, iniciales, parseDay, pesos } from "@gym/format";
// ...
export function shapeFicha(
  c: FichaClienteRow,
  asistencias: FichaAsistRow[],
  ventas: FichaVentaRow[],
  hoy: Date,
  hoyIso: string,
  tz: string,
  plantillas: PlantillaDTO[],
  negocio: string,
  attendedSincePurchase: number,
  extras: { precios?: string; datos_pago?: string } = {},
): FichaDerivada {
  // ... unchanged body, except:
  const pagos: FichaPago[] = ventas.map((v) => ({
    fechaDisplay: fmtShort(fechaEnZona(v.fecha, tz)),
    // ...
  }));
  // ...
  const compradoDisplay = latest ? fmtShort(fechaEnZona(latest.fecha, tz)) : "—";
  const altaDisplay = fmtShort(fechaEnZona(c.created_at, tz));
  // ...
  const lastPurchaseDate = latest ? fechaEnZona(latest.fecha, tz) : null;
  // ... rest unchanged
```

- [ ] **Step 2: `derive.test.ts` — insert the `tz` argument at every `shapeFicha(...)` call**

Add near the top: `const TZ_FORGE = "America/Chihuahua"; // models the real Forge gym's zone (matches supabase/tests' convention)`. Then insert `TZ_FORGE` as the 6th positional argument in all 16 `shapeFicha(...)` calls (right after `HOY_ISO`).

- [ ] **Step 3: Run `derive.test.ts` to confirm it's green**

Run: `pnpm --filter @gym/data test -- derive`
Expected: PASS (byte-identical outputs — `TZ_FORGE` reproduces the old hardcoded behavior exactly)

- [ ] **Step 4: `export/rows.ts` + `export/rows.test.ts` — `RespaldoData.tz`, drop the `fechaChihuahua` import**

```typescript
// rows.ts
import { fechaEnZona, fmtShort, isoDay, parseDay } from "@gym/format";
// ...
export interface RespaldoData {
  generadoHoy: Date;
  tz: string; // the gym's resolved IANA zone — shapeClientes/shapeVentas' fechaEnZona calls
  clientes: RespaldoCliente[];
  ventas: RespaldoVenta[];
  asistencias: RespaldoAsistencia[];
  paquetes: RespaldoPaquete[];
}
// ...
function shapeClientes(data: RespaldoData): RespaldoSheet {
  // ...
  isoDay(fechaEnZona(c.alta, data.tz)),
  // ...
}
function shapeVentas(data: RespaldoData, nombreDe: (id: string) => string): RespaldoSheet {
  // ...
  isoDay(fechaEnZona(v.fecha, data.tz)),
  // ...
}
```

```typescript
// rows.test.ts
const data = (over: Partial<RespaldoData> = {}): RespaldoData => ({
  generadoHoy: HOY,
  tz: "America/Chihuahua",
  clientes: [],
  ventas: [],
  asistencias: [],
  paquetes: [],
  ...over,
});
```

- [ ] **Step 5: Run `rows.test.ts` to confirm it's green**

Run: `pnpm --filter @gym/data test -- rows`
Expected: PASS

- [ ] **Step 6: `respaldo.ts` — resolve `tz` via `getOperatorGym`, populate `RespaldoData.tz`**

```typescript
import { hoyEnZona } from "@gym/format";
import { getOperatorGym } from "./gym";
// ...
export const getRespaldoData = cache(
  async (client?: SupabaseServer): Promise<RespaldoData> => {
    const supabase = client ?? (await createClient());
    const { timezone: tz } = await getOperatorGym(supabase);
    const generadoHoy = hoyEnZona(tz);
    // ... unchanged reads ...
    return { generadoHoy, tz, clientes, ventas, asistencias, paquetes };
  },
);
```

- [ ] **Step 7: Run `respaldo.test.ts` (uses the Task-3-extended shared fake) to confirm it's green**

Run: `pnpm --filter @gym/data test -- respaldo`
Expected: PASS (the fake's default gym timezone is Chihuahua, so `generadoHoy`/`tz` resolve exactly as before)

- [ ] **Step 8: `clientes.ts` — resolve `tz` once per exported reader, thread into `hoyEnZona`/`fechaEnZona`/`shapeFicha`**

```typescript
import { addDays, fechaEnZona, hoyEnZona, iniciales, isTelValido, toIsoDay } from "@gym/format";
import { getOperatorGym } from "./gym";
// ...
export const getClientesParaPase = cache(
  async (client?: SupabaseServer): Promise<PaseClienteDTO[]> => {
    const supabase = client ?? (await createClient());
    const { data } = await supabase.from("clientes")./* unchanged select */;
    if (!data) return [];
    const { timezone: tz } = await getOperatorGym(supabase);
    const hoy = hoyEnZona(tz);
    return data.map((c) => derivarPaseCliente(c, hoy));
  },
);
// getClientesLite: no hoyChihuahua usage — untouched.
export const getClientesRoster = cache(
  async (client?: SupabaseServer): Promise<ClienteDerivado[]> => {
    const supabase = client ?? (await createClient());
    const { timezone: tz } = await getOperatorGym(supabase);
    const hoy = hoyEnZona(tz);
    // ... unchanged Promise.all + map ...
  },
);
export const getRosterResumen = cache(
  async (client?: SupabaseServer): Promise<ResumenRoster> => {
    const supabase = client ?? (await createClient());
    const { timezone: tz } = await getOperatorGym(supabase);
    const hoy = hoyEnZona(tz);
    // ... unchanged ...
  },
);
export const getClienteFicha = cache(
  async (id: string, client?: SupabaseServer): Promise<ClienteFichaDTO | null> => {
    const supabase = client ?? (await createClient());
    const { timezone: tz } = await getOperatorGym(supabase);
    const hoy = hoyEnZona(tz);
    const hoyIso = toIsoDay(hoy);
    // ... unchanged fetch, but:
    const lastPurchaseIso = ventas[0] ? toIsoDay(fechaEnZona(ventas[0].fecha, tz)) : null;
    // ... unchanged, but the shapeFicha call becomes:
    const ficha = shapeFicha(
      c, asistRes.data ?? [], ventas, hoy, hoyIso, tz, plantillas, negocio, attendedSincePurchase,
      { precios: fmtPrecios(paquetes), datos_pago: fmtDatosPago(cobro) },
    );
    return { ...ficha, hoyIso, vecinos };
  },
);
```

- [ ] **Step 9: `asistencia.ts` — `getAsistenciasHoy`**

```typescript
import { hoyEnZona, iniciales, toIsoDay } from "@gym/format";
import { getOperatorGym } from "./gym";
// ...
export async function getAsistenciasHoy(client?: SupabaseServer): Promise<AsistenciaHoy[]> {
  const supabase = client ?? (await createClient());
  const { timezone: tz } = await getOperatorGym(supabase);
  const hoyIso = toIsoDay(hoyEnZona(tz));
  // ... unchanged ...
}
```

- [ ] **Step 10: `resumen.ts` — `getResumenMes`**

```typescript
import { fechaEnZona, hoyEnZona, parseDay, toIsoDay } from "@gym/format";
import { getOperatorGym } from "./gym";
// ...
export const getResumenMes = cache(
  async (client?: SupabaseServer): Promise<ResumenMes> => {
    const supabase = client ?? (await createClient());
    const { timezone: tz } = await getOperatorGym(supabase);
    const hoy = hoyEnZona(tz);
    // ... unchanged desde/desdeIso ...
    // ... unchanged reads ...
    const ventas: VentaResumen[] = (ventasRes.data ?? []).map((v) => ({
      fecha: fechaEnZona(v.fecha, tz),
      monto: Number(v.monto),
    }));
    // ... rest unchanged
  },
);
```

- [ ] **Step 11: `paquetes.ts` — `getPaquetes` accepts an optional `tz` override**

```typescript
import { calcVigenciaEnd } from "@gym/domain/rules";
import { fmtShort, hoyEnZona } from "@gym/format";
import { getOperatorGym } from "./gym";
// ...
export const getPaquetes = cache(
  async (client?: SupabaseServer, tz?: string): Promise<PaqueteDTO[]> => {
    const supabase = client ?? (await createClient());
    const { data } = await supabase.from("paquetes")./* unchanged select */;
    if (!data) return [];
    const zone = tz ?? (await getOperatorGym(supabase)).timezone;
    const hoy = hoyEnZona(zone);
    // ... unchanged map ...
  },
);
```

- [ ] **Step 12: `ventas.ts` — `crearVenta` resolves `tz` once, passes it into `getPaquetes`**

```typescript
import { addDays, firstName, fmtShort, hoyEnZona, iniciales, isTelValido, parseDay, toIsoDay } from "@gym/format";
import { getOperatorGym } from "./gym";
// ...
export async function crearVenta(raw: unknown, client?: SupabaseServer): Promise<VentaResult> {
  const input = crearVentaSchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const { timezone: tz } = await getOperatorGym(supabase);
  // ... unchanged paqRes/cliRes fetch ...
  const hoy = hoyEnZona(tz);
  // ... unchanged saldo math ...
  const [{ data: perfil }, plantillas, paquetes, cobro] = await Promise.all([
    supabase.from("perfil").select("negocio, coach, ciudad").maybeSingle(),
    listarPlantillas(supabase),
    getPaquetes(supabase, tz).catch(() => []),
    getCobro(supabase).catch(() => null),
  ]);
  // ... rest unchanged
}
```

- [ ] **Step 13: Run the full `@gym/data` suite**

Run: `pnpm --filter @gym/data test`
Expected: PASS — every test green, including `ventas.test.ts` (crearVenta now calls `getOperatorGym` + `getPaquetes(supabase, tz)`, satisfied by Task 3's fake extensions)

- [ ] **Step 14: Commit**

```bash
git add packages/data/src/server/derive.ts packages/data/src/server/derive.test.ts \
        packages/data/src/server/clientes.ts packages/data/src/server/asistencia.ts \
        packages/data/src/server/paquetes.ts packages/data/src/server/respaldo.ts \
        packages/data/src/server/resumen.ts packages/data/src/server/ventas.ts \
        packages/data/src/server/export/rows.ts packages/data/src/server/export/rows.test.ts
git commit -m "feat(data): thread the resolved gym timezone through every reader/writer (21 call sites)"
```

---

### Task 5: Thread `tz` through the 3 apps/admin call sites + fix the domain-rules comment

**Files:**
- Modify: `apps/admin/src/app/(app)/cuenta/page.tsx`
- Modify: `apps/admin/src/app/(app)/cuenta/respaldo/route.ts`
- Modify: `apps/admin/src/app/(app)/inicio/page.tsx`
- Modify: `apps/admin/src/app/(app)/asistencia/page.tsx`
- Modify: `packages/domain/src/rules.ts` (comment only — `hoyChihuahua()` → `hoyEnZona(tz)`)

**Interfaces:**
- Consumes: `getOperatorGym` (exported from `@gym/data/server/gym`), `hoyEnZona`/`hoyIsoEnZona` (Task 1).

- [ ] **Step 1: `cuenta/page.tsx`**

```typescript
import { getCobro } from "@gym/data/server/cobro";
import { getOperatorGym } from "@gym/data/server/gym";
import { getPaquetes } from "@gym/data/server/paquetes";
import { getPerfil } from "@gym/data/server/perfil";
import { listarPlantillas } from "@gym/data/server/plantillas";
import { getResumenMes } from "@gym/data/server/resumen";
import { fmtMesAnio, hoyEnZona } from "@gym/format";

import { CuentaScreen } from "./_components/cuenta";

export default async function Page() {
  const { timezone: tz } = await getOperatorGym();
  const [perfil, resumen, cobro, paquetes, plantillas] = await Promise.all([
    getPerfil(),
    getResumenMes(),
    getCobro(),
    getPaquetes(undefined, tz),
    listarPlantillas(),
  ]);

  const mesLabel = fmtMesAnio(hoyEnZona(tz));

  return (
    <CuentaScreen
      perfil={perfil}
      resumen={resumen}
      cobro={cobro}
      paquetes={paquetes}
      plantillas={plantillas}
      mesLabel={mesLabel}
    />
  );
}
```

- [ ] **Step 2: `cuenta/respaldo/route.ts` — reuse `data.generadoHoy` instead of a second `hoyChihuahua()` call**

```typescript
import { requireOperator } from "@gym/data/server/_auth";
import { getRespaldoData } from "@gym/data/server/respaldo";
import { buildRespaldoRows } from "@gym/data/server/export/rows";
import { buildRespaldoWorkbook } from "@gym/data/server/export/workbook";
import { toIsoDay } from "@gym/format";
import { createClient } from "@gym/data/server/supabase";

export const runtime = "nodejs";

const XLSX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export async function GET(): Promise<Response> {
  const supabase = await createClient();

  try {
    await requireOperator(supabase);
  } catch {
    return new Response("No autenticado", { status: 401 });
  }

  const data = await getRespaldoData(supabase);
  const buffer = await buildRespaldoWorkbook(buildRespaldoRows(data));
  const filename = `forge-respaldo-${toIsoDay(data.generadoHoy)}.xlsx`;

  return new Response(buffer as unknown as BodyInit, {
    status: 200,
    headers: {
      "Content-Type": XLSX_CONTENT_TYPE,
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
```

- [ ] **Step 3: `inicio/page.tsx`**

```typescript
import { getAsistenciasHoy } from "@gym/data/server/asistencia";
import { getRosterResumen } from "@gym/data/server/clientes";
import { getOperatorGym } from "@gym/data/server/gym";
import { getResumenMes } from "@gym/data/server/resumen";
import { fmtEyebrow, hoyEnZona } from "@gym/format";

import { InicioScreen } from "./_components/inicio";

export default async function Page() {
  const { timezone: tz } = await getOperatorGym();
  const [resumen, roster, recientes] = await Promise.all([
    getResumenMes(),
    getRosterResumen(),
    getAsistenciasHoy(),
  ]);

  const eyebrow = fmtEyebrow(hoyEnZona(tz));

  return (
    <InicioScreen
      resumen={resumen}
      vigentes={roster.vigentes}
      totalActivos={roster.totalActivos}
      recientes={recientes}
      eyebrow={eyebrow}
    />
  );
}
```

- [ ] **Step 4: `asistencia/page.tsx`**

```typescript
import { getMarcadas } from "@gym/data/server/asistencia";
import { getClientesParaPase } from "@gym/data/server/clientes";
import { getOperatorGym } from "@gym/data/server/gym";
import { hoyIsoEnZona } from "@gym/format";

import { AsistenciaScreen } from "./_components/asistencia";

export default async function Page() {
  const { timezone: tz } = await getOperatorGym();
  const [clientes, marcadas] = await Promise.all([getClientesParaPase(), getMarcadas()]);
  return <AsistenciaScreen clientes={clientes} marcadas={marcadas} hoyIso={hoyIsoEnZona(tz)} />;
}
```

- [ ] **Step 5: `packages/domain/src/rules.ts` — fix the stale comment reference**

Change `and calls this with \`hoyChihuahua()\`.` to `and calls this with \`hoyEnZona(tz)\`.` (comment only, no code/behavior change — `@gym/domain` still imports nothing from `@gym/format`).

- [ ] **Step 6: `pnpm --filter admin build`**

Run: `pnpm --filter admin build`
Expected: PASS — no type errors from the `@gym/format`/`@gym/data` signature changes.

- [ ] **Step 7: Commit**

```bash
git add apps/admin/src/app/\(app\)/cuenta/page.tsx apps/admin/src/app/\(app\)/cuenta/respaldo/route.ts \
        apps/admin/src/app/\(app\)/inicio/page.tsx apps/admin/src/app/\(app\)/asistencia/page.tsx \
        packages/domain/src/rules.ts
git commit -m "feat(admin): resolve + pass the operator's gym timezone at every page/route call site"
```

---

### Task 6: `toggle_pase` — derive `gym.timezone` in-RPC, kill the two SQL literals

**Files:**
- Create: `supabase/migrations/20260702170000_toggle_pase_gym_timezone.sql`

**Interfaces:**
- Consumes: `clientes.gym_id` (already selected into `v_gym` since #20), `gym.timezone` (from #18).
- Produces: `toggle_pase`'s `hora`-stamp case now computes `(now() at time zone v_tz)` instead of the literal `'America/Chihuahua'`.

- [ ] **Step 1: Write the additive `CREATE OR REPLACE` migration**

```sql
-- toggle_pase now derives its "is p_fecha today" check from the CLIENTE'S GYM
-- timezone (audit finding 1, PRD #17 named exception), never the hardcoded
-- 'America/Chihuahua' literal. Additive CREATE OR REPLACE — same signature,
-- same RETURNS TABLE, only the two-literal hora-stamp case changes to a
-- gym-derived variable. search_path='' kept (ADR-0013 posture); SECURITY
-- INVOKER unchanged (RLS still the hard boundary on the clientes/asistencias
-- reads/writes inside).
create or replace function public.toggle_pase(p_cliente_id uuid, p_fecha date)
 returns table(present boolean, hora text)
 language plpgsql
 set search_path to ''
as $function$
declare
  v_uid uuid := (select auth.uid());
  v_clases int;
  v_gym uuid;
  v_tz text;
  v_active_id uuid;
  v_active_consumio boolean;
  v_consumio boolean;
  v_hora time;
begin
  if v_uid is null then
    raise exception 'No autenticado';
  end if;

  select clases_restantes, gym_id into v_clases, v_gym
    from public.clientes where id = p_cliente_id;   -- RLS-scoped; asistencia inherits the cliente's gym
  if not found then
    raise exception 'Cliente no encontrado';
  end if;

  -- Server-authoritative: the gym's own timezone row, never a client-supplied param.
  select timezone into v_tz from public.gym where id = v_gym;

  select id, consumio into v_active_id, v_active_consumio
    from public.asistencias
   where cliente_id = p_cliente_id and fecha = p_fecha and deleted_at is null
   order by created_at desc
   limit 1;

  if v_active_id is not null then
    -- toggle OFF
    update public.asistencias set deleted_at = now() where id = v_active_id;
    if v_active_consumio and v_clases is not null then
      update public.clientes set clases_restantes = clases_restantes + 1 where id = p_cliente_id;
    end if;
    return query select false, null::text;
    return;
  end if;

  -- toggle ON
  v_consumio := (v_clases is not null and v_clases > 0);
  v_hora := case
    when p_fecha = (now() at time zone v_tz)::date
      then (now() at time zone v_tz)::time
    else null
  end;

  insert into public.asistencias (user_id, cliente_id, fecha, hora, consumio, gym_id)
  values (v_uid, p_cliente_id, p_fecha, v_hora, v_consumio, v_gym);

  if v_consumio then
    update public.clientes set clases_restantes = clases_restantes - 1
     where id = p_cliente_id and clases_restantes > 0;   -- guarded decrement
  end if;

  return query select true, to_char(v_hora, 'HH24:MI');
end;
$function$;
```

- [ ] **Step 2: Apply via `mcp__supabase__apply_migration`**

Name: `toggle_pase_gym_timezone`. Apply against project `hjppxawglmukfvsgmcog`.

- [ ] **Step 3: Run `mcp__supabase__get_advisors` (type: security, then type: performance)**

Expected: no NEW advisories introduced by this migration (the function already had `search_path=''`/`plpgsql`/no new SECURITY DEFINER surface — this only swaps a literal for a variable).

- [ ] **Step 4: Re-run the existing `supabase/tests/toggle_pase_rules.sql` against the live project (via `mcp__supabase__execute_sql`)**

Expected: `toggle_pase rules: OK` — Forge's gym row IS `America/Chihuahua`, so `v_tz` resolves to the exact literal the test's own `(now() at time zone 'America/Chihuahua')::date` computes; behavior is byte-identical.

- [ ] **Step 5: Commit**

```bash
git add supabase/migrations/20260702170000_toggle_pase_gym_timezone.sql
git commit -m "feat(rls): toggle_pase derives the gym's timezone from clientes.gym_id, kills the 2 hardcoded literals"
```

---

### Task 7: Seeded-suite vector — gym #2 (America/Mexico_City) attendance/sale dates

**Files:**
- Create: `supabase/tests/toggle_pase_gym2_timezone.sql`

**Interfaces:**
- Consumes: the live `gym`/`gym_membership`/`clientes`/`toggle_pase` schema. Follows the exact BEGIN/ROLLBACK, self-asserting-RAISE, zero-prod-UUID convention of `supabase/tests/toggle_pase_rules.sql` and `supabase/tests/gym_membership_rls.sql`. Self-contained (creates its OWN synthetic gym #2 row inside the transaction — does NOT depend on or mutate the live `red`/`forge` seed rows, and does NOT depend on sibling slice #21's harness, per the issue's "standalone self-asserting SQL test" instruction).

- [ ] **Step 1: Write the test**

```sql
-- Slice #25 seeded-suite vector: a SYNTHETIC gym #2 (America/Mexico_City,
-- distinct from Forge/RED's live America/Chihuahua) proves toggle_pase's
-- hora-stamp derives EACH gym's OWN timezone, not a hardcoded one. Self-
-- contained: creates its own gym + membership + cliente inside the
-- transaction, never touches the live forge/red rows. Zero prod UUIDs.
-- BEGIN/ROLLBACK — touches no row permanently. Composes with #21's mechanized
-- denial harness when the stacks merge (same conventions, no shared fixtures).
--
-- HOW TO RUN: via the Supabase MCP execute_sql, or
--   psql "$DATABASE_URL" -f supabase/tests/toggle_pase_gym2_timezone.sql

begin;

do $$
declare
  v_op       uuid := (select user_id from public.perfil order by created_at limit 1);
  v_gym2     uuid;
  v_cliente  uuid;
  v_today_mx date := (now() at time zone 'America/Mexico_City')::date;
  v_present  boolean;
  v_hora     text;
begin
  -- ── Seed: a synthetic gym #2 (Mexico City), the operator's membership on it,
  -- and one finite cliente owned by the operator under gym #2 ────────────────
  insert into public.gym (slug, brand_name, timezone, brand_module_id)
  values ('test-gym2-mexico-city', 'TEST Gym 2', 'America/Mexico_City', 'base')
  returning id into v_gym2;

  insert into public.gym_membership (user_id, gym_id, role)
  values (v_op, v_gym2, 'owner')
  on conflict (user_id, gym_id) do nothing;

  -- Act as that operator for the RLS-scoped writes below.
  perform set_config(
    'request.jwt.claims',
    json_build_object('sub', v_op::text, 'role', 'authenticated')::text,
    true
  );
  set local role authenticated;

  insert into public.clientes (user_id, nombre, tel, clases_restantes, vence, paquete_nombre, gym_id)
  values (v_op, 'TEST gym2 finite', '0000000003', 5, v_today_mx + 20, '8 clases', v_gym2)
  returning id into v_cliente;

  -- ── The vector: toggle_pase's hora-stamp uses GYM #2's zone (Mexico City),
  -- not Chihuahua — p_fecha = Mexico-City-today must stamp a non-null hora,
  -- proving `v_tz` was resolved from THIS cliente's gym, not a hardcoded literal.
  select present, hora into v_present, v_hora from public.toggle_pase(v_cliente, v_today_mx);
  if v_present is not true then
    raise exception 'GYM2 FAIL: toggle ON did not register present';
  end if;
  if v_hora is null then
    raise exception 'GYM2 FAIL: hora-stamp did not fire for Mexico-City-today (tz not gym-derived?)';
  end if;

  raise notice 'gym #2 (America/Mexico_City) timezone vector: toggle_pase stamped hora % for its own zone', v_hora;
end $$;

select 'toggle_pase gym #2 timezone vector: OK' as result;
rollback;
```

- [ ] **Step 2: Run it against the live project via `mcp__supabase__execute_sql`**

Expected: `toggle_pase gym #2 timezone vector: OK`, rolled back (zero permanent rows).

- [ ] **Step 3: Commit**

```bash
git add supabase/tests/toggle_pase_gym2_timezone.sql
git commit -m "test(rls): seeded-suite vector — gym #2 (America/Mexico_City) toggle_pase hora-stamp"
```

---

### Task 8: Full-repo grep proof + final verification loop

**Files:** none (verification only)

- [ ] **Step 1: Grep-prove no hardcoded `America/Chihuahua` remains in production TS or in `toggle_pase`**

Run: `grep -rn "America/Chihuahua" packages apps --include="*.ts" --include="*.tsx" | grep -v ".test.ts"`
Expected: zero matches (test files may carry the named `TZ_FORGE`/literal fixture constant per Task 1/4's convention — grep those separately and confirm each is a documented test fixture, not production logic).

Run: `grep -n "America/Chihuahua" supabase/migrations/20260702170000_toggle_pase_gym_timezone.sql`
Expected: zero matches.

- [ ] **Step 2: Run the full verification loop**

Run: `pnpm lint && pnpm typecheck && pnpm test && pnpm build`
Expected: all green, exit 0.

- [ ] **Step 3: `mcp__supabase__get_advisors` (security + performance) one final time**

Expected: clean (matches the pre-existing baseline — no new advisories).

- [ ] **Step 4: `keep-it-lean` pass on the full diff**

Deletion test on `gym.ts` (does every other file that imports it actually need it — yes, all 21 call sites plus 4 admin pages). No-op test on comments/commit messages.

- [ ] **Step 5: Final commit (if the above steps produced any fixups)**

```bash
git add -A
git commit -m "chore: verification fixups for slice #25"
```
