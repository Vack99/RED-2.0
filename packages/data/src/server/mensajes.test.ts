import { describe, expect, it } from "vitest";

import { listMensajes, marcarLeido } from "./mensajes";
import type { SupabaseServer } from "./supabase";

/**
 * The admin messages readers map rows → DTOs and mark-read via RLS-scoped writes. RLS itself (staff read
 * their gym's rows only, cross-tenant denial) is proven against the real schema in
 * supabase/tests/contact_intake.sql; here we assert the row→DTO mapping (read_at → `leido`), the
 * newest-first order, and the mark-read update path (parse + not-found throw). A chain-recording fake
 * stands in for the injected client (ADR-0001).
 */

interface Recorder {
  order?: { col: string; opts: unknown };
  updated?: Record<string, unknown>;
  eq?: { col: string; val: unknown };
}

function makeReadFake(rows: Record<string, unknown>[]): { client: SupabaseServer; rec: Recorder } {
  const rec: Recorder = {};
  const builder: Record<string, unknown> = {
    select: () => builder,
    order: (col: string, opts: unknown) => {
      rec.order = { col, opts };
      return Promise.resolve({ data: rows, error: null });
    },
  };
  const client = { from: () => builder };
  return { client: client as unknown as SupabaseServer, rec };
}

function makeWriteFake(
  updateResult: { data: unknown[] | null; error: unknown },
): { client: SupabaseServer; rec: Recorder } {
  const rec: Recorder = {};
  const builder: Record<string, unknown> = {
    update: (patch: Record<string, unknown>) => {
      rec.updated = patch;
      return builder;
    },
    eq: (col: string, val: unknown) => {
      rec.eq = { col, val };
      return builder;
    },
    select: () => Promise.resolve(updateResult),
  };
  const client = {
    from: () => builder,
    auth: { getClaims: async () => ({ data: { claims: { sub: "op-1" } } }) },
  };
  return { client: client as unknown as SupabaseServer, rec };
}

const ID = "11111111-1111-4111-8111-111111111111";

describe("mensajes DAL — admin read + mark-read", () => {
  it("listMensajes maps rows (read_at → leido), newest first", async () => {
    const { client, rec } = makeReadFake([
      { id: "a", nombre: "Ana", correo: "ana@x.mx", mensaje: "Hola", read_at: null, created_at: "2026-07-06T10:00:00Z" },
      { id: "b", nombre: "Beto", correo: "beto@x.mx", mensaje: "Info", read_at: "2026-07-06T09:00:00Z", created_at: "2026-07-05T09:00:00Z" },
    ]);
    const list = await listMensajes(client);
    expect(list).toEqual([
      { id: "a", nombre: "Ana", correo: "ana@x.mx", mensaje: "Hola", leido: false, createdAt: "2026-07-06T10:00:00Z" },
      { id: "b", nombre: "Beto", correo: "beto@x.mx", mensaje: "Info", leido: true, createdAt: "2026-07-05T09:00:00Z" },
    ]);
    expect(rec.order).toEqual({ col: "created_at", opts: { ascending: false } });
  });

  it("listMensajes returns [] when the read yields no rows", async () => {
    const { client } = makeReadFake([]);
    expect(await listMensajes(client)).toEqual([]);
  });

  it("marcarLeido parses the id and stamps read_at on that row", async () => {
    const { client, rec } = makeWriteFake({ data: [{ id: ID }], error: null });
    await marcarLeido({ id: ID }, client);
    expect(rec.eq).toEqual({ col: "id", val: ID });
    expect(rec.updated).toHaveProperty("read_at");
  });

  it("marcarLeido throws when the id matches no row", async () => {
    const { client } = makeWriteFake({ data: [], error: null });
    await expect(marcarLeido({ id: ID }, client)).rejects.toThrow("Mensaje no encontrado");
  });

  it("marcarLeido rejects a non-uuid id", async () => {
    const { client } = makeWriteFake({ data: [], error: null });
    await expect(marcarLeido({ id: "not-a-uuid" }, client)).rejects.toThrow();
  });
});
