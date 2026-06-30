import { describe, expect, it } from "vitest";

import {
  actualizarPlantilla,
  crearPlantilla,
  eliminarPlantilla,
  listarPlantillas,
  sembrarPlantillasDefault,
} from "./plantillas";
import type { SupabaseServer } from "./supabase";

/**
 * The seam: every plantillas write takes an injectable client (ADR-0001), so the orchestration —
 * zod validation, the auth gate, and the exact RPC payload — is testable with a hand-rolled fake.
 * The RPC behavior itself (cap, ownership, idempotent seed) is proven against the real schema in
 * supabase/tests/plantillas_rules.sql (ADR-0005).
 */
interface FakeClient {
  rpcCalls: { name: string; args: Record<string, unknown> }[];
  client: SupabaseServer;
}

function makeFake(opts: { sub?: string | null; rows?: unknown[] } = {}): FakeClient {
  const sub = opts.sub === undefined ? "op-1" : opts.sub;
  const rpcCalls: { name: string; args: Record<string, unknown> }[] = [];
  const rows = opts.rows ?? [];
  const client = {
    auth: { getClaims: async () => ({ data: sub ? { claims: { sub } } : null }) },
    from: () => {
      const b = {
        select: () => b,
        order: () => b,
        then: (resolve: (v: { data: unknown[]; error: null }) => unknown) => resolve({ data: rows, error: null }),
      };
      return b;
    },
    rpc: (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      return Promise.resolve({ data: name === "crear_plantilla" ? "new-id" : null, error: null });
    },
  };
  return { rpcCalls, client: client as unknown as SupabaseServer };
}

describe("plantillas DAL — write orchestration (injected fake)", () => {
  it("listarPlantillas maps rows → PlantillaDTO[]", async () => {
    const fake = makeFake({ rows: [{ id: "t1", nombre: "Recibo", body: "Hola {nombre}" }] });
    const list = await listarPlantillas(fake.client);
    expect(list).toEqual([{ id: "t1", nombre: "Recibo", body: "Hola {nombre}" }]);
  });

  it("crearPlantilla sends the exact crear_plantilla payload", async () => {
    const fake = makeFake();
    await crearPlantilla({ nombre: "Bienvenida", body: "Hola {nombre}" }, fake.client);
    expect(fake.rpcCalls).toEqual([{ name: "crear_plantilla", args: { p_nombre: "Bienvenida", p_body: "Hola {nombre}" } }]);
  });

  it("actualizarPlantilla sends the exact actualizar_plantilla payload", async () => {
    const fake = makeFake();
    await actualizarPlantilla(
      { id: "11111111-1111-4111-8111-111111111111", nombre: "Recibo", body: "x" },
      fake.client,
    );
    expect(fake.rpcCalls[0]).toEqual({
      name: "actualizar_plantilla",
      args: { p_id: "11111111-1111-4111-8111-111111111111", p_nombre: "Recibo", p_body: "x" },
    });
  });

  it("eliminarPlantilla sends the exact eliminar_plantilla payload", async () => {
    const fake = makeFake();
    await eliminarPlantilla({ id: "11111111-1111-4111-8111-111111111111" }, fake.client);
    expect(fake.rpcCalls[0]).toEqual({ name: "eliminar_plantilla", args: { p_id: "11111111-1111-4111-8111-111111111111" } });
  });

  it("sembrarPlantillasDefault calls the seed RPC", async () => {
    const fake = makeFake();
    await sembrarPlantillasDefault(fake.client);
    expect(fake.rpcCalls).toHaveLength(1);
    expect(fake.rpcCalls[0].name).toBe("sembrar_plantillas_default");
  });

  it("rejects an empty nombre (zod) before any write", async () => {
    const fake = makeFake();
    await expect(crearPlantilla({ nombre: "  ", body: "x" }, fake.client)).rejects.toThrow();
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("rejects an over-length body (zod) before any write", async () => {
    const fake = makeFake();
    await expect(crearPlantilla({ nombre: "X", body: "a".repeat(1001) }, fake.client)).rejects.toThrow();
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("throws 'No autenticado' when getClaims returns no sub", async () => {
    const fake = makeFake({ sub: null });
    await expect(crearPlantilla({ nombre: "X", body: "y" }, fake.client)).rejects.toThrow("No autenticado");
    expect(fake.rpcCalls).toHaveLength(0);
  });
});
