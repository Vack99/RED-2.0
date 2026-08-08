import { describe, expect, it } from "vitest";

import { aceptarAcuerdo, getAcuerdoAceptado } from "./legal";
import type { SupabaseServer } from "./supabase";

/**
 * The Gate 0.1 click-wrap DAL (#254): a chain-recording fake stands in for the injected
 * Supabase client (ADR-0001). RLS itself (staff read, owner-only write, cross-tenant denial)
 * is proven against the real schema in supabase/tests/aceptar_acuerdo.sql; here we assert the
 * query shape, the p_* argument mapping, the null→undefined ip/user-agent translation, and the
 * camelCase return mapping.
 */

/** A fake exposing exactly the `.from("acuerdo_aceptacion").select().eq().eq().eq().maybeSingle()`
 *  chain `getAcuerdoAceptado` walks, recording every `.eq()` call for the scoping assertion. */
function fakeRead(row: Record<string, unknown> | null) {
  const eqCalls: [string, unknown][] = [];
  const client = {
    from: (table: string) => {
      if (table !== "acuerdo_aceptacion") throw new Error(`unexpected table ${table}`);
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (col: string, val: unknown) => {
          eqCalls.push([col, val]);
          return b;
        },
        maybeSingle: async () => ({ data: row, error: null }),
      };
      return b;
    },
  };
  return { client: client as unknown as SupabaseServer, eqCalls };
}

describe("getAcuerdoAceptado", () => {
  it("returns true when a row exists for this exact (gym, documento, version)", async () => {
    const { client } = fakeRead({ id: "a-1" });
    expect(await getAcuerdoAceptado("gym-1", "anexo_tratamiento_datos", "0.1-borrador", client)).toBe(
      true,
    );
  });

  it("returns false when no row matches (unaccepted, or a superseded version — AC3)", async () => {
    const { client } = fakeRead(null);
    expect(await getAcuerdoAceptado("gym-1", "anexo_tratamiento_datos", "0.1-borrador", client)).toBe(
      false,
    );
  });

  it("scopes the read to gym_id, documento, AND version — a stale-version row must not match", async () => {
    const { client, eqCalls } = fakeRead(null);
    await getAcuerdoAceptado("gym-1", "anexo_tratamiento_datos", "0.1-borrador", client);
    expect(eqCalls).toEqual([
      ["gym_id", "gym-1"],
      ["documento", "anexo_tratamiento_datos"],
      ["version", "0.1-borrador"],
    ]);
  });
});

/** A fake exposing `.auth.getClaims()` (requireOperator's presence check) plus the
 *  `.rpc(name, args).single()` chain `aceptarAcuerdo` walks. */
function fakeAccept(opts: {
  sub?: string | null;
  result?: { data: unknown; error: unknown };
  capture?: (name: string, args: unknown) => void;
}): SupabaseServer {
  const sub = opts.sub === undefined ? "owner-1" : opts.sub;
  const result =
    opts.result ?? { data: { id: "a-1", ya_existia: false, contenido_hash: "h".repeat(64) }, error: null };
  const client = {
    auth: { getClaims: async () => ({ data: sub ? { claims: { sub } } : null }) },
    rpc: (name: string, args: unknown) => {
      opts.capture?.(name, args);
      return { single: async () => result };
    },
  };
  return client as unknown as SupabaseServer;
}

describe("aceptarAcuerdo", () => {
  const input = {
    gymId: "gym-1",
    documento: "anexo_tratamiento_datos",
    version: "0.1-borrador",
    contenido: "texto íntegro",
    ip: "203.0.113.9",
    userAgent: "vitest/1.0",
  };

  it("forwards every field as the RPC's p_* args, unchanged", async () => {
    let seen: { name: string; args: unknown } | null = null;
    const client = fakeAccept({
      capture: (name, args) => {
        seen = { name, args };
      },
    });
    await aceptarAcuerdo(input, client);
    expect(seen).toEqual({
      name: "aceptar_acuerdo",
      args: {
        p_gym_id: "gym-1",
        p_documento: "anexo_tratamiento_datos",
        p_version: "0.1-borrador",
        p_contenido: "texto íntegro",
        p_ip: "203.0.113.9",
        p_user_agent: "vitest/1.0",
      },
    });
  });

  // The RPC's ip/user_agent params are `default null` — passing JS `undefined` lets that
  // default apply. A caller that instead sent the STRING "null" (or an empty string) would
  // hit the column's own check constraint (ip/user_agent length checks) — this is the guard
  // against that, at the DAL boundary rather than the DB's.
  it("translates null ip/userAgent into undefined args, never the literal string 'null'", async () => {
    let seen: { name: string; args: unknown } | null = null;
    const client = fakeAccept({
      capture: (name, args) => {
        seen = { name, args };
      },
    });
    await aceptarAcuerdo({ ...input, ip: null, userAgent: null }, client);
    const args = seen!.args as Record<string, unknown>;
    expect(args.p_ip).toBeUndefined();
    expect(args.p_user_agent).toBeUndefined();
  });

  it("returns the RPC row camelCased", async () => {
    const client = fakeAccept({
      result: { data: { id: "a-9", ya_existia: true, contenido_hash: "c".repeat(64) }, error: null },
    });
    expect(await aceptarAcuerdo(input, client)).toEqual({
      id: "a-9",
      yaExistia: true,
      contenidoHash: "c".repeat(64),
    });
  });

  it("throws the RPC's error message (e.g. an operator refused by has_role)", async () => {
    const client = fakeAccept({ result: { data: null, error: { message: "No autorizado" } } });
    await expect(aceptarAcuerdo(input, client)).rejects.toThrow("No autorizado");
  });

  it("throws 'No autenticado' for an anonymous caller — never reaches the RPC", async () => {
    const client = fakeAccept({
      sub: null,
      capture: () => {
        throw new Error("RPC must not be called without a session");
      },
    });
    await expect(aceptarAcuerdo(input, client)).rejects.toThrow("No autenticado");
  });
});
