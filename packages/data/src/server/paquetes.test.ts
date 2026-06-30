import { describe, expect, it } from "vitest";

import { actualizarPaquete } from "./paquetes";
import type { SupabaseServer } from "./supabase";

/**
 * The seam: `actualizarPaquete` takes an injectable client (ADR-0001), so the
 * orchestration — zod validation, the auth gate, the exact RPC payload, and the
 * es-MX error mapping — is testable with a hand-rolled fake. The RPC behavior
 * itself (RLS ownership, the single-favorite invariant, the derived nombre, the
 * 30-day vigencia invariant) is proven against the real schema (ADR-0005).
 *
 * The editor now sets the real class count (1..30, or null = ilimitado); the
 * display nombre is DERIVED in-DB, so `nombre` is NOT an input. `clases` is the
 * nullable RPC arg, mirroring registrar_venta: a number is spread into the
 * payload as `p_clases`, and null (ilimitado) OMITS the key so the RPC's
 * DEFAULT NULL applies (no `as any`, types stay honest).
 */
interface FakeClient {
  rpcCalls: { name: string; args: Record<string, unknown> }[];
  client: SupabaseServer;
}

function makeFake(
  opts: { sub?: string | null; error?: unknown } = {},
): FakeClient {
  const sub = opts.sub === undefined ? "op-1" : opts.sub;
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const client = {
    auth: { getClaims: async () => ({ data: sub ? { claims: { sub } } : null }) },
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return Promise.resolve({ data: null, error: opts.error ?? null });
    },
  };
  return { rpcCalls, client: client as unknown as SupabaseServer };
}

const ID = "11111111-1111-4111-8111-111111111111";
const valid = (over: Record<string, unknown> = {}) => ({
  id: ID,
  precio: 800,
  popular: true,
  clases: 8,
  ...over,
});

describe("paquetes DAL — actualizarPaquete write orchestration (injected fake)", () => {
  it("calls actualizar_paquete with { p_id, p_precio, p_popular, p_clases } when clases is a number", async () => {
    const fake = makeFake();
    await actualizarPaquete(valid({ clases: 3 }), fake.client);
    expect(fake.rpcCalls).toEqual([
      {
        name: "actualizar_paquete",
        args: { p_id: ID, p_precio: 800, p_popular: true, p_clases: 3 },
      },
    ]);
  });

  it("OMITS p_clases (so the RPC DEFAULT NULL applies) when clases is null (ilimitado)", async () => {
    const fake = makeFake();
    await actualizarPaquete(valid({ clases: null }), fake.client);
    expect(fake.rpcCalls).toHaveLength(1);
    expect(fake.rpcCalls[0]).toEqual({
      name: "actualizar_paquete",
      args: { p_id: ID, p_precio: 800, p_popular: true },
    });
    expect("p_clases" in fake.rpcCalls[0].args).toBe(false);
  });

  it("never sends p_nombre (the display nombre is derived in-DB)", async () => {
    const fake = makeFake();
    await actualizarPaquete(valid(), fake.client);
    expect("p_nombre" in fake.rpcCalls[0].args).toBe(false);
  });

  it("throws a generic es-MX error when the RPC fails", async () => {
    const fake = makeFake({ error: { message: "boom", code: "P0001" } });
    await expect(actualizarPaquete(valid(), fake.client)).rejects.toThrow(
      "No se pudo actualizar el paquete",
    );
  });

  it("maps a unique-violation (23505) on paquetes_nombre_uq to the duplicate-clases es-MX message", async () => {
    const fake = makeFake({
      error: { code: "23505", message: 'duplicate key value violates unique constraint "paquetes_nombre_uq"' },
    });
    await expect(actualizarPaquete(valid(), fake.client)).rejects.toThrow(
      "Ya tienes un paquete con esa cantidad de clases",
    );
  });

  it("does NOT mislabel a 23505 from a DIFFERENT constraint (e.g. paquetes_one_popular) as duplicate-clases — falls through to generic", async () => {
    // The single-favorite partial unique index (paquetes_one_popular) is also a
    // 23505; only paquetes_nombre_uq is the duplicate-clases case, so gating must
    // key on the constraint name, not the bare code.
    const fake = makeFake({
      error: { code: "23505", message: 'duplicate key value violates unique constraint "paquetes_one_popular"' },
    });
    await expect(actualizarPaquete(valid(), fake.client)).rejects.toThrow(
      "No se pudo actualizar el paquete",
    );
  });

  it("accepts clases = 1 (the lower bound)", async () => {
    const fake = makeFake();
    await actualizarPaquete(valid({ clases: 1 }), fake.client);
    expect(fake.rpcCalls[0].args.p_clases).toBe(1);
  });

  it("accepts clases = 30 (the upper bound)", async () => {
    const fake = makeFake();
    await actualizarPaquete(valid({ clases: 30 }), fake.client);
    expect(fake.rpcCalls[0].args.p_clases).toBe(30);
  });

  it("rejects clases = 0 (below range, zod) before any write", async () => {
    const fake = makeFake();
    await expect(actualizarPaquete(valid({ clases: 0 }), fake.client)).rejects.toThrow();
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("rejects clases = 31 (above range, zod) before any write", async () => {
    const fake = makeFake();
    await expect(actualizarPaquete(valid({ clases: 31 }), fake.client)).rejects.toThrow();
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("rejects a non-integer clases (1.5, zod) before any write", async () => {
    const fake = makeFake();
    await expect(actualizarPaquete(valid({ clases: 1.5 }), fake.client)).rejects.toThrow();
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("rejects a non-number clases (zod) before any write", async () => {
    const fake = makeFake();
    await expect(actualizarPaquete(valid({ clases: "8" }), fake.client)).rejects.toThrow();
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("rejects a non-positive precio (zod) before any write", async () => {
    const fake = makeFake();
    await expect(actualizarPaquete(valid({ precio: 0 }), fake.client)).rejects.toThrow();
    await expect(actualizarPaquete(valid({ precio: -100 }), fake.client)).rejects.toThrow();
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("rejects a non-integer precio (zod) before any write", async () => {
    const fake = makeFake();
    await expect(actualizarPaquete(valid({ precio: 99.5 }), fake.client)).rejects.toThrow();
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("rejects a non-uuid id (zod) before any write", async () => {
    const fake = makeFake();
    await expect(actualizarPaquete(valid({ id: "not-a-uuid" }), fake.client)).rejects.toThrow();
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("throws 'No autenticado' when getClaims returns no sub", async () => {
    const fake = makeFake({ sub: null });
    await expect(actualizarPaquete(valid(), fake.client)).rejects.toThrow("No autenticado");
    expect(fake.rpcCalls).toHaveLength(0);
  });
});
