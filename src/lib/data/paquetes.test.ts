import { describe, expect, it } from "vitest";

import { actualizarPaquete } from "./paquetes";
import type { SupabaseServer } from "@/lib/supabase/server";

/**
 * The seam: `actualizarPaquete` takes an injectable client (ADR-0001), so the
 * orchestration — zod validation, the auth gate, the exact RPC payload, and the
 * es-MX error mapping — is testable with a hand-rolled fake. The RPC behavior
 * itself (RLS ownership, the 30-day vigencia invariant) is proven against the
 * real schema (ADR-0005). Mirrors plantillas.test.ts, adding an injectable RPC
 * error so the unique-violation (23505) branch and the generic branch are covered.
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
  nombre: "8 clases",
  precio: 800,
  popular: true,
  ...over,
});

describe("paquetes DAL — actualizarPaquete write orchestration (injected fake)", () => {
  it("calls actualizar_paquete with exactly { p_id, p_nombre, p_precio, p_popular }", async () => {
    const fake = makeFake();
    await actualizarPaquete(valid(), fake.client);
    expect(fake.rpcCalls).toEqual([
      {
        name: "actualizar_paquete",
        args: { p_id: ID, p_nombre: "8 clases", p_precio: 800, p_popular: true },
      },
    ]);
  });

  it("trims the nombre before sending it to the RPC", async () => {
    const fake = makeFake();
    await actualizarPaquete(valid({ nombre: "  Ilimitado  " }), fake.client);
    expect(fake.rpcCalls[0].args.p_nombre).toBe("Ilimitado");
  });

  it("throws a generic es-MX error when the RPC fails", async () => {
    const fake = makeFake({ error: { message: "boom", code: "P0001" } });
    await expect(actualizarPaquete(valid(), fake.client)).rejects.toThrow(
      "No se pudo actualizar el paquete",
    );
  });

  it("maps a unique-violation (23505) to the duplicate-name es-MX message", async () => {
    const fake = makeFake({
      error: { code: "23505", message: 'duplicate key value violates unique constraint "paquetes_nombre_uq"' },
    });
    await expect(actualizarPaquete(valid(), fake.client)).rejects.toThrow(
      "Ya tienes un paquete con ese nombre",
    );
  });

  it("rejects an empty/whitespace nombre (zod) before any write", async () => {
    const fake = makeFake();
    await expect(actualizarPaquete(valid({ nombre: "   " }), fake.client)).rejects.toThrow();
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("rejects an over-40-char nombre (zod) before any write", async () => {
    const fake = makeFake();
    await expect(actualizarPaquete(valid({ nombre: "a".repeat(41) }), fake.client)).rejects.toThrow();
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
