import { describe, expect, it } from "vitest";

import { cambiarModoReservas, contarReservasFuturas } from "./modo-reservas";
import type { SupabaseServer } from "./supabase";

/**
 * The seam this exercises: both `modo-reservas.ts` functions take an injectable client
 * (ADR-0001), so the DAL orchestration — the count read's filters, the RPC's args, the
 * error-to-throw surfacing — is testable with a hand-rolled fake. No supabase, no DB; the
 * RPC's own written-row contract is `supabase/tests/cambiar_modo_reservas_rules.sql`.
 */

interface FakeOpts {
  sub?: string | null;
  /** Seeded `reservation` rows, each carrying its embedded `class_session.starts_at` the
   *  way PostgREST's `!inner` join would shape it. */
  reservas?: { id: string; gym_id: string; status: string; class_session: { starts_at: string } }[];
  rpcData?: number | null;
  rpcError?: { message: string } | null;
}

const GYM_ROW = {
  gym_id: "gym-1",
  gym: { timezone: "America/Chihuahua", slug: "forge", brand_name: "Forge", booking_enabled: true },
};

function makeFake(opts: FakeOpts = {}) {
  const sub = opts.sub === undefined ? "op-1" : opts.sub;
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const eqCalls: [string, unknown][] = [];
  const gtCalls: [string, unknown][] = [];
  const selectCalls: [string, { count?: string; head?: boolean } | undefined][] = [];

  function reservationBuilder() {
    let filtered = [...(opts.reservas ?? [])];
    // Dot-path reads resolve through the embedded `class_session` object — the exact shape
    // PostgREST's `!inner` join returns, mirroring `clientes.test.ts`'s own fake for the
    // same idiom (`leerReservas`'s `class_session.starts_at` filter).
    const leer = (r: Record<string, unknown>, col: string): unknown =>
      col.includes(".")
        ? (r[col.split(".")[0]] as Record<string, unknown> | null)?.[col.split(".")[1]]
        : r[col];
    const b = {
      // `{ count: "exact", head: true }` is what production must send — asserted below — and
      // mirrors PostgREST's head response: `data` is null, the row count rides `count`
      // instead, so a fix that reverts to a row-length read fails loudly.
      select: (columns: string, options?: { count?: string; head?: boolean }) => {
        selectCalls.push([columns, options]);
        return b;
      },
      eq: (col: string, val: unknown) => {
        eqCalls.push([col, val]);
        filtered = filtered.filter((r) => leer(r as unknown as Record<string, unknown>, col) === val);
        return b;
      },
      gt: (col: string, val: unknown) => {
        gtCalls.push([col, val]);
        filtered = filtered.filter(
          (r) => (leer(r as unknown as Record<string, unknown>, col) as string) > (val as string),
        );
        return b;
      },
      then: (resolve: (v: { data: null; count: number; error: null }) => unknown) =>
        resolve({ data: null, count: filtered.length, error: null }),
    };
    return b;
  }

  const client = {
    auth: {
      getClaims: async () => ({ data: sub ? { claims: { sub } } : null }),
    },
    from: (table: string) => {
      if (table === "reservation") return reservationBuilder();
      if (table === "gym_membership") {
        return {
          select: () => ({
            in: () => ({
              order: () => ({
                then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
                  resolve({ data: [GYM_ROW], error: null }),
              }),
            }),
          }),
        };
      }
      throw new Error(`modo-reservas.test fake: unexpected table "${table}"`);
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      const resolved = opts.rpcError
        ? { data: null, error: opts.rpcError }
        : { data: opts.rpcData ?? 0, error: null };
      return { then: (resolve: (v: typeof resolved) => unknown) => resolve(resolved) };
    },
  };

  return { client: client as unknown as SupabaseServer, rpcCalls, eqCalls, gtCalls, selectCalls };
}

describe("contarReservasFuturas", () => {
  it("counts only this gym's still-reservada bookings whose class is still ahead", async () => {
    const { client, eqCalls, gtCalls, selectCalls } = makeFake({
      reservas: [
        // Counted: gym-1, reservada, future.
        { id: "r1", gym_id: "gym-1", status: "reservada", class_session: { starts_at: "2099-01-01T00:00:00Z" } },
        { id: "r2", gym_id: "gym-1", status: "reservada", class_session: { starts_at: "2099-02-01T00:00:00Z" } },
        // Excluded: already cancelled.
        { id: "r3", gym_id: "gym-1", status: "cancelada", class_session: { starts_at: "2099-01-01T00:00:00Z" } },
        // Excluded: this gym's own booking, but the class already happened.
        { id: "r4", gym_id: "gym-1", status: "reservada", class_session: { starts_at: "2020-01-01T00:00:00Z" } },
        // Excluded: another gym entirely.
        { id: "r5", gym_id: "gym-2", status: "reservada", class_session: { starts_at: "2099-01-01T00:00:00Z" } },
      ],
    });

    await expect(contarReservasFuturas(client)).resolves.toBe(2);
    expect(eqCalls).toContainEqual(["gym_id", "gym-1"]);
    expect(eqCalls).toContainEqual(["status", "reservada"]);
    expect(gtCalls.some(([col]) => col === "class_session.starts_at")).toBe(true);
    // The PostgREST server-side count, not a row-length read: a row list truncates at
    // max_rows (1000) long before a busy gym's future-booking count does.
    expect(selectCalls).toEqual([["id, class_session!inner(starts_at)", { count: "exact", head: true }]]);
  });

  it("returns 0, not an error, when the gym has no future reservations", async () => {
    const { client } = makeFake({ reservas: [] });
    await expect(contarReservasFuturas(client)).resolves.toBe(0);
  });
});

describe("cambiarModoReservas", () => {
  it("sends p_habilitar and the resolved gym's p_gym_id, returning the RPC's cancelled count", async () => {
    const { client, rpcCalls } = makeFake({ rpcData: 3 });
    await expect(cambiarModoReservas(false, client)).resolves.toBe(3);
    expect(rpcCalls).toEqual([
      { name: "cambiar_modo_reservas", args: { p_habilitar: false, p_gym_id: "gym-1" } },
    ]);
  });

  it("defaults a null RPC return to 0", async () => {
    const { client } = makeFake({ rpcData: null });
    await expect(cambiarModoReservas(true, client)).resolves.toBe(0);
  });

  it("surfaces the RPC's own refusal message on error (e.g. a non-staff caller)", async () => {
    const { client } = makeFake({ rpcError: { message: "No autorizado" } });
    await expect(cambiarModoReservas(false, client)).rejects.toThrow("No autorizado");
  });
});
