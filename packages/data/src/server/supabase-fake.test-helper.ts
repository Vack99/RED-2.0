import type { SupabaseServer } from "./supabase";

/**
 * Shared chain-capturing Supabase fake for DAL unit tests (test infra, NOT
 * production code — never imported by `src/`).
 *
 * It is a per-table thenable query builder that resolves to `{ data, error }`
 * and RECORDS its `.is()`/`.gte()`/`.range()` calls so a test can assert the
 * soft-delete filter, the absence of a date filter, and the pagination windows
 * applied at the query.
 *
 * `.range(from, to)` returns the requested INCLUSIVE slice of the seeded list
 * (PostgREST semantics), so a paginator's "loop until a short page returns"
 * termination is exercised for real — a single seeded read of `[from, to]`
 * resolves to exactly that window.
 *
 * Slice #25 (per-gym timezone): every client also answers `.auth.getClaims()`
 * (a fixed authenticated operator) and the `gym_membership`/`gym` tables
 * `getOperatorGym` resolves — defaulting to Forge's REAL zone
 * (America/Chihuahua), so every EXISTING test (none of which assert a
 * different zone) stays green untouched. Override via `rows.gymTimezone`.
 */

export interface FakeRows {
  clientes?: unknown[];
  ventas?: unknown[];
  asistencias?: unknown[];
  paquetes?: unknown[];
  /** Overrides the default `gym.timezone` (America/Chihuahua) getOperatorGym resolves to. */
  gymTimezone?: string;
  /** Overrides the default `gym.slug` ("forge") getOperatorGym resolves to. */
  gymSlug?: string;
  /** Overrides the default `gym.brand_name` ("Forge") getOperatorGym resolves to (#97). */
  gymBrandName?: string;
}

export interface FakeClient {
  client: SupabaseServer;
  /** Per-table record of `.is(col, val)` calls — the soft-delete assertion target. */
  isCalls: Record<string, [string, unknown][]>;
  /** Per-table record of `.gte(col, val)` calls — the window lower-bound assertion target. */
  gteCalls: Record<string, [string, unknown][]>;
  /** Per-table record of `.lt(col, val)` calls — the window UPPER-bound assertion target
   *  (unassertable before the month-scoped respaldo needed it — named present need). */
  ltCalls: Record<string, [string, unknown][]>;
  /** Per-table record of `.range(from, to)` calls — the pagination-window assertion target. */
  rangeCalls: Record<string, [number, number][]>;
  /** Per-table record of `.eq(col, val)` calls — the tenant-scope (`gym_id`) assertion target. */
  eqCalls: Record<string, [string, unknown][]>;
  /** Per-table record of `.in(col, vals)` calls — the staff-role filter assertion target. */
  inCalls: Record<string, [string, unknown[]][]>;
  /** Per-table record of `.order(col)` calls — the pagination-tiebreaker assertion target. */
  orderCalls: Record<string, string[]>;
}

export function makeFake(
  rows: FakeRows,
  opts: {
    error?: { table: string; err: unknown };
    /** What `client.rpc(...).single()` resolves — the RPC-outcome assertion target
     *  (e.g. togglePase's typed ok/refusal mapping). Defaults to a null row. */
    rpc?: { data?: unknown; error?: { message: string } | null };
  } = {},
): FakeClient {
  const isCalls: Record<string, [string, unknown][]> = {};
  const gteCalls: Record<string, [string, unknown][]> = {};
  const ltCalls: Record<string, [string, unknown][]> = {};
  const rangeCalls: Record<string, [number, number][]> = {};
  const eqCalls: Record<string, [string, unknown][]> = {};
  const inCalls: Record<string, [string, unknown[]][]> = {};
  const orderCalls: Record<string, string[]> = {};

  const builder = (table: string, list: unknown[]) => {
    // A paginating read calls `.from(table)` once PER page, each returning a fresh
    // builder (mirrors the real client). The call records must ACCUMULATE across those
    // builders, so initialize each table's record once — not on every `.from()`.
    isCalls[table] ??= [];
    gteCalls[table] ??= [];
    ltCalls[table] ??= [];
    rangeCalls[table] ??= [];
    eqCalls[table] ??= [];
    inCalls[table] ??= [];
    orderCalls[table] ??= [];
    const err = opts.error?.table === table ? opts.error.err : null;
    // The window this builder will resolve. `undefined` = no `.range()` was applied
    // (clientes/paquetes single reads) → resolve the whole list.
    let window: [number, number] | undefined;
    const b: Record<string, unknown> = {
      select: () => b,
      // Filters RECORD but never narrow the seeded list — a test seeds exactly the
      // rows it wants back and asserts the filter was SENT (the query contract),
      // mirroring how gteCalls proves windowing without the fake re-implementing it.
      eq: (col: string, val: unknown) => {
        eqCalls[table].push([col, val]);
        return b;
      },
      in: (col: string, vals: unknown[]) => {
        inCalls[table].push([col, vals]);
        return b;
      },
      is: (col: string, val: unknown) => {
        isCalls[table].push([col, val]);
        return b;
      },
      gte: (col: string, val: unknown) => {
        gteCalls[table].push([col, val]);
        return b;
      },
      lt: (col: string, val: unknown) => {
        ltCalls[table].push([col, val]);
        return b;
      },
      range: (from: number, to: number) => {
        rangeCalls[table].push([from, to]);
        window = [from, to];
        return b;
      },
      order: (col: string) => {
        orderCalls[table].push(col);
        return b;
      },
      limit: () => b, // no-op passthrough — the fake's seeded lists are already small
      // getOperatorGym's terminal call — resolves to the first (only) seeded row.
      maybeSingle: async () => {
        if (err) return { data: null, error: err };
        return { data: list[0] ?? null, error: null };
      },
      // Awaited directly: `await supabase.from(t).select(...)...` resolves here. A
      // ranged read returns the inclusive `[from, to]` slice (PostgREST semantics) so
      // the paginator concatenates pages and stops on the first short page.
      then: (resolve: (v: { data: unknown[] | null; error: unknown }) => unknown) => {
        if (err) return resolve({ data: null, error: err });
        const page = window ? list.slice(window[0], window[1] + 1) : list;
        return resolve({ data: page, error: null });
      },
    };
    return b;
  };

  const client = {
    auth: {
      getClaims: async () => ({ data: { claims: { sub: "test-operator" } } }),
    },
    from: (table: string) => {
      if (table === "gym_membership")
        return builder(table, [{ gym_id: "test-gym", role: "owner" }]);
      if (table === "gym")
        return builder(table, [
          {
            timezone: rows.gymTimezone ?? "America/Chihuahua",
            slug: rows.gymSlug ?? "forge",
            brand_name: rows.gymBrandName ?? "Forge",
          },
        ]);
      return builder(table, (rows as Record<string, unknown[]>)[table] ?? []);
    },
    rpc: () => ({
      single: async () => ({ data: opts.rpc?.data ?? null, error: opts.rpc?.error ?? null }),
    }),
  };

  return {
    client: client as unknown as SupabaseServer,
    isCalls,
    gteCalls,
    ltCalls,
    rangeCalls,
    eqCalls,
    inCalls,
    orderCalls,
  };
}
