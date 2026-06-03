import type { SupabaseServer } from "@/lib/supabase/server";

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
 */

export interface FakeRows {
  clientes?: unknown[];
  ventas?: unknown[];
  asistencias?: unknown[];
  paquetes?: unknown[];
}

export interface FakeClient {
  client: SupabaseServer;
  /** Per-table record of `.is(col, val)` calls — the soft-delete assertion target. */
  isCalls: Record<string, [string, unknown][]>;
  /** Per-table record of `.gte(col, val)` calls — proves NO date filter is applied. */
  gteCalls: Record<string, [string, unknown][]>;
  /** Per-table record of `.range(from, to)` calls — the pagination-window assertion target. */
  rangeCalls: Record<string, [number, number][]>;
}

export function makeFake(
  rows: FakeRows,
  opts: { error?: { table: string; err: unknown } } = {},
): FakeClient {
  const isCalls: Record<string, [string, unknown][]> = {};
  const gteCalls: Record<string, [string, unknown][]> = {};
  const rangeCalls: Record<string, [number, number][]> = {};

  const builder = (table: string, list: unknown[]) => {
    // A paginating read calls `.from(table)` once PER page, each returning a fresh
    // builder (mirrors the real client). The call records must ACCUMULATE across those
    // builders, so initialize each table's record once — not on every `.from()`.
    isCalls[table] ??= [];
    gteCalls[table] ??= [];
    rangeCalls[table] ??= [];
    const err = opts.error?.table === table ? opts.error.err : null;
    // The window this builder will resolve. `undefined` = no `.range()` was applied
    // (clientes/paquetes single reads) → resolve the whole list.
    let window: [number, number] | undefined;
    const b: Record<string, unknown> = {
      select: () => b,
      eq: () => b,
      is: (col: string, val: unknown) => {
        isCalls[table].push([col, val]);
        return b;
      },
      gte: (col: string, val: unknown) => {
        gteCalls[table].push([col, val]);
        return b;
      },
      range: (from: number, to: number) => {
        rangeCalls[table].push([from, to]);
        window = [from, to];
        return b;
      },
      order: () => b,
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
    from: (table: string) => builder(table, (rows as Record<string, unknown[]>)[table] ?? []),
  };

  return { client: client as unknown as SupabaseServer, isCalls, gteCalls, rangeCalls };
}
