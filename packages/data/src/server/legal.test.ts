import { describe, expect, it, vi } from "vitest";

import {
  aceptarAcuerdo,
  actualizarIdentidadLegal,
  getAcuerdoAceptado,
  getIdentidadLegal,
  getIdentidadLegalPublica,
} from "./legal";
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
function fakeRead(row: Record<string, unknown> | null, error: { message: string } | null = null) {
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
        maybeSingle: async () => ({ data: row, error }),
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

  // Fail-closed stays (a read error still returns `false`, matching the layout's existing
  // getOperatorGyms().catch(() => []) posture), but review fix round 1: an outage must be
  // DISTINGUISHABLE in the logs from "nobody has accepted yet" — a bare `false` return reads
  // identically either way, so this asserts the one visible side effect: a structured warn line.
  it("logs a structured warning on a read error, but still fails closed (returns false)", async () => {
    const { client } = fakeRead(null, { message: "connection reset" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await getAcuerdoAceptado("gym-9", "anexo_tratamiento_datos", "0.1-borrador", client)).toBe(
      false,
    );
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(warn.mock.calls[0][0] as string)).toEqual({
      event: "acuerdo-aceptado-read-error",
      gymId: "gym-9",
      documento: "anexo_tratamiento_datos",
      version: "0.1-borrador",
      error: "connection reset",
    });
    warn.mockRestore();
  });

  it("logs NOTHING on a clean read (no per-request noise for the ordinary case)", async () => {
    const { client } = fakeRead(null);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await getAcuerdoAceptado("gym-1", "anexo_tratamiento_datos", "0.1-borrador", client);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
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

  // Review fix round 1: neither `ip` (column check `between 1 and 100`) nor `user_agent`
  // (`<= 500`) is bounded by its source — a raw request header. Before this fix a long-enough
  // header raised a check-constraint error INSIDE the RPC, which surfaced as a thrown error on
  // the one screen with no bypass (AceptarAnexo): the owner could never get past it, forever.
  describe("length truncation (a raw header is unbounded; the DB columns are not)", () => {
    it("truncates a user_agent over 500 chars to exactly 500 before the RPC call", async () => {
      let seen: { name: string; args: unknown } | null = null;
      const client = fakeAccept({
        capture: (name, args) => {
          seen = { name, args };
        },
      });
      const long = "M".repeat(600);
      await aceptarAcuerdo({ ...input, userAgent: long }, client);
      const args = seen!.args as Record<string, unknown>;
      expect(args.p_user_agent).toBe("M".repeat(500));
    });

    it("truncates an ip (e.g. a long multi-hop x-forwarded-for) over 100 chars to exactly 100", async () => {
      let seen: { name: string; args: unknown } | null = null;
      const client = fakeAccept({
        capture: (name, args) => {
          seen = { name, args };
        },
      });
      const long = "203.0.113.9, ".repeat(20); // well over 100 chars
      await aceptarAcuerdo({ ...input, ip: long }, client);
      const args = seen!.args as Record<string, unknown>;
      expect(args.p_ip).toBe(long.slice(0, 100));
      expect((args.p_ip as string).length).toBe(100);
    });

    it("leaves a short ip/userAgent untouched (truncation is a ceiling, not a rewrite)", async () => {
      let seen: { name: string; args: unknown } | null = null;
      const client = fakeAccept({
        capture: (name, args) => {
          seen = { name, args };
        },
      });
      await aceptarAcuerdo(input, client);
      const args = seen!.args as Record<string, unknown>;
      expect(args.p_ip).toBe(input.ip);
      expect(args.p_user_agent).toBe(input.userAgent);
    });

    // Minor 4 (final review round): `ip`'s check constraint is `between 1 and 100` — a `''`
    // fails it just as surely as it needs no truncation. The one real caller (apps/admin's
    // aceptarAnexoAction) already collapses empty→null before calling in, but this function's
    // own contract must hold for ANY caller, so an empty string passed straight through here
    // must not reach the RPC either.
    it("collapses an empty-string ip to null before the RPC call — never lets '' hit the check constraint", async () => {
      let seen: { name: string; args: unknown } | null = null;
      const client = fakeAccept({
        capture: (name, args) => {
          seen = { name, args };
        },
      });
      await aceptarAcuerdo({ ...input, ip: "" }, client);
      const args = seen!.args as Record<string, unknown>;
      expect(args.p_ip).toBeUndefined(); // p_ip: null ?? undefined — the RPC's own optional-arg shape
    });
  });
});

/**
 * The CUENTA legal-identity editor's DAL (#255): `getIdentidadLegal` (a `.rpc()` read, not a raw
 * `.from("gym")` select — see the export's own doc comment for why) and `actualizarIdentidadLegal`
 * (two writes: `gym.legal_name` via `.update()`, `gym_legal` via `.upsert()`). RLS/grant
 * composition itself is proven against the real schema in
 * supabase/tests/gym_legal_name_rules.sql; here we assert the query shape, the zod
 * validation/blank-clears-to-null behavior, and the fail-closed read.
 */

/** A fake exposing `.auth.getClaims()` (requireOperator) + `.from("gym_membership")` (the
 *  embedded-join `getOperatorGym` walks — mirrors about-values.test.ts's makeFake) + `.rpc()`. */
function fakeIdentidadRead(opts: {
  sub?: string | null;
  rpcResult?: { data: unknown; error: unknown };
  rpcCapture?: (name: string, args: unknown) => void;
}): SupabaseServer {
  const sub = opts.sub === undefined ? "op-1" : opts.sub;
  const rpcResult = opts.rpcResult ?? { data: null, error: null };
  const client = {
    auth: { getClaims: async () => ({ data: sub ? { claims: { sub } } : null }) },
    from: (table: string) => {
      if (table !== "gym_membership") throw new Error(`unexpected table ${table}`);
      return {
        select: () => ({
          eq: () => ({
            in: () => ({
              order: async () => ({
                data: [{ gym_id: "gym-1", gym: { timezone: "America/Chihuahua", slug: "forge", brand_name: "Forge" } }],
                error: null,
              }),
            }),
          }),
        }),
      };
    },
    rpc: (name: string, args: unknown) => {
      opts.rpcCapture?.(name, args);
      return { maybeSingle: async () => rpcResult };
    },
  };
  return client as unknown as SupabaseServer;
}

describe("getIdentidadLegal", () => {
  it("maps a full RPC row to the camelCased DTO", async () => {
    const client = fakeIdentidadRead({
      rpcResult: {
        data: {
          razon_social: "Gimnasio Forge, S.A. de C.V.",
          domicilio: "Av. Siempre Viva 123",
          email_arco: "datos@forge.mx",
          area_datos_personales: "Departamento de Datos Personales",
        },
        error: null,
      },
    });
    expect(await getIdentidadLegal(client)).toEqual({
      razonSocial: "Gimnasio Forge, S.A. de C.V.",
      domicilio: "Av. Siempre Viva 123",
      emailArco: "datos@forge.mx",
      areaDatosPersonales: "Departamento de Datos Personales",
    });
  });

  it("returns an all-null DTO when no row comes back (a gym with nothing filled in yet)", async () => {
    const client = fakeIdentidadRead({ rpcResult: { data: null, error: null } });
    expect(await getIdentidadLegal(client)).toEqual({
      razonSocial: null,
      domicilio: null,
      emailArco: null,
      areaDatosPersonales: null,
    });
  });

  it("calls obtener_identidad_legal with p_gym_id = the resolved operator gym's id", async () => {
    let seen: { name: string; args: unknown } | null = null;
    const client = fakeIdentidadRead({ rpcCapture: (name, args) => (seen = { name, args }) });
    await getIdentidadLegal(client);
    expect(seen).toEqual({ name: "obtener_identidad_legal", args: { p_gym_id: "gym-1" } });
  });

  it("fails closed (all-null DTO) on a read error, and logs a structured warning", async () => {
    const client = fakeIdentidadRead({ rpcResult: { data: null, error: { message: "connection reset" } } });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await getIdentidadLegal(client)).toEqual({
      razonSocial: null,
      domicilio: null,
      emailArco: null,
      areaDatosPersonales: null,
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(warn.mock.calls[0][0] as string)).toEqual({
      event: "identidad-legal-read-error",
      gymId: "gym-1",
      error: "connection reset",
    });
    warn.mockRestore();
  });
});

interface ActualizarCalls {
  gymUpdate?: { payload: Record<string, unknown>; id: string };
  legalUpsert?: { payload: Record<string, unknown>; config: unknown };
}

function fakeActualizarIdentidad(opts: {
  sub?: string | null;
  gymUpdateData?: unknown[] | null;
  gymUpdateError?: unknown;
  legalUpsertError?: unknown;
}): { client: SupabaseServer; calls: ActualizarCalls } {
  const sub = opts.sub === undefined ? "op-1" : opts.sub;
  const calls: ActualizarCalls = {};
  const client = {
    auth: { getClaims: async () => ({ data: sub ? { claims: { sub } } : null }) },
    from: (table: string) => {
      if (table === "gym_membership") {
        return {
          select: () => ({
            eq: () => ({
              in: () => ({
                order: async () => ({
                  data: [{ gym_id: "gym-1", gym: { timezone: "America/Chihuahua", slug: "forge", brand_name: "Forge" } }],
                  error: null,
                }),
              }),
            }),
          }),
        };
      }
      if (table === "gym") {
        return {
          update: (payload: Record<string, unknown>) => ({
            eq: (_col: string, id: string) => {
              calls.gymUpdate = { payload, id };
              return {
                select: async () => ({
                  data: opts.gymUpdateData !== undefined ? opts.gymUpdateData : [{ id }],
                  error: opts.gymUpdateError ?? null,
                }),
              };
            },
          }),
        };
      }
      if (table === "gym_legal") {
        return {
          upsert: (payload: Record<string, unknown>, config: unknown) => {
            calls.legalUpsert = { payload, config };
            return Promise.resolve({ error: opts.legalUpsertError ?? null });
          },
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { client: client as unknown as SupabaseServer, calls };
}

const IDENTIDAD_INPUT = {
  razonSocial: "Gimnasio Forge, S.A. de C.V.",
  domicilio: "Av. Siempre Viva 123, Chihuahua, Chih.",
  emailArco: "datos@forge.mx",
  areaDatosPersonales: "Departamento de Datos Personales",
};

describe("actualizarIdentidadLegal", () => {
  it("updates gym.legal_name and upserts gym_legal with the exact payloads", async () => {
    const fake = fakeActualizarIdentidad({});
    await actualizarIdentidadLegal(IDENTIDAD_INPUT, fake.client);
    expect(fake.calls.gymUpdate).toEqual({ payload: { legal_name: IDENTIDAD_INPUT.razonSocial }, id: "gym-1" });
    expect(fake.calls.legalUpsert).toEqual({
      payload: {
        gym_id: "gym-1",
        domicilio: IDENTIDAD_INPUT.domicilio,
        email_arco: IDENTIDAD_INPUT.emailArco,
        area_datos_personales: IDENTIDAD_INPUT.areaDatosPersonales,
      },
      config: { onConflict: "gym_id" },
    });
  });

  it("a blank field CLEARS to null, never an empty string (the DB CHECK rejects '')", async () => {
    const fake = fakeActualizarIdentidad({});
    await actualizarIdentidadLegal({ razonSocial: "  ", domicilio: "", emailArco: "", areaDatosPersonales: "   " }, fake.client);
    expect(fake.calls.gymUpdate?.payload).toEqual({ legal_name: null });
    expect(fake.calls.legalUpsert?.payload).toEqual({
      gym_id: "gym-1",
      domicilio: null,
      email_arco: null,
      area_datos_personales: null,
    });
  });

  it("trims surrounding whitespace on a non-blank value", async () => {
    const fake = fakeActualizarIdentidad({});
    await actualizarIdentidadLegal({ ...IDENTIDAD_INPUT, razonSocial: "  Gimnasio Forge  " }, fake.client);
    expect(fake.calls.gymUpdate?.payload.legal_name).toBe("Gimnasio Forge");
  });

  it("rejects an invalid emailArco (zod) before any write", async () => {
    const fake = fakeActualizarIdentidad({});
    await expect(
      actualizarIdentidadLegal({ ...IDENTIDAD_INPUT, emailArco: "not-an-email" }, fake.client),
    ).rejects.toThrow();
    expect(fake.calls.gymUpdate).toBeUndefined();
    expect(fake.calls.legalUpsert).toBeUndefined();
  });

  it("rejects an over-length domicilio (zod) before any write", async () => {
    const fake = fakeActualizarIdentidad({});
    await expect(
      actualizarIdentidadLegal({ ...IDENTIDAD_INPUT, domicilio: "a".repeat(301) }, fake.client),
    ).rejects.toThrow();
    expect(fake.calls.gymUpdate).toBeUndefined();
  });

  it("throws 'No autenticado' when getClaims returns no sub — before any write", async () => {
    const fake = fakeActualizarIdentidad({ sub: null });
    await expect(actualizarIdentidadLegal(IDENTIDAD_INPUT, fake.client)).rejects.toThrow("No autenticado");
    expect(fake.calls.gymUpdate).toBeUndefined();
    expect(fake.calls.legalUpsert).toBeUndefined();
  });

  it("throws 'Gimnasio no encontrado' when the gym update affects 0 rows (RLS hid it)", async () => {
    const fake = fakeActualizarIdentidad({ gymUpdateData: [] });
    await expect(actualizarIdentidadLegal(IDENTIDAD_INPUT, fake.client)).rejects.toThrow("Gimnasio no encontrado");
    expect(fake.calls.legalUpsert).toBeUndefined();
  });

  it("throws when the gym.legal_name update errors", async () => {
    const fake = fakeActualizarIdentidad({ gymUpdateError: { message: "boom" } });
    await expect(actualizarIdentidadLegal(IDENTIDAD_INPUT, fake.client)).rejects.toThrow(
      "No se pudo guardar la razón social",
    );
  });

  it("throws when the gym_legal upsert errors", async () => {
    const fake = fakeActualizarIdentidad({ legalUpsertError: { message: "boom" } });
    await expect(actualizarIdentidadLegal(IDENTIDAD_INPUT, fake.client)).rejects.toThrow(
      "No se pudo guardar el domicilio y el contacto ARCO",
    );
  });
});

/**
 * getIdentidadLegalPublica (#256) — the PUBLIC anon-scoped read `/legal`, `/registro` and
 * `/activar/contrasena` use, as opposed to `getIdentidadLegal` above (staff-only, via
 * obtener_identidad_legal). Two plain `.from().select().eq().maybeSingle()` reads, no auth
 * plumbing (no requireOperator, no getOperatorGym) — RLS/grant composition itself is proven
 * against the real schema in supabase/tests/gym_tenant_anon_read.sql (`legal_name`) and
 * anon_catalog_read.sql (`gym_legal`); here we assert the query shape and the camelCase mapping.
 */
function fakeIdentidadPublica(opts: {
  gymRow?: Record<string, unknown> | null;
  legalRow?: Record<string, unknown> | null;
  gymError?: { message: string } | null;
  legalError?: { message: string } | null;
}) {
  const eqCalls: [string, string, unknown][] = [];
  const client = {
    from: (table: string) => {
      const b: Record<string, unknown> = {
        select: () => b,
        eq: (col: string, val: unknown) => {
          eqCalls.push([table, col, val]);
          return b;
        },
        maybeSingle: async () => {
          if (table === "gym") return { data: opts.gymRow ?? null, error: opts.gymError ?? null };
          if (table === "gym_legal") return { data: opts.legalRow ?? null, error: opts.legalError ?? null };
          throw new Error(`unexpected table ${table}`);
        },
      };
      return b;
    },
  };
  return { client: client as unknown as SupabaseServer, eqCalls };
}

describe("getIdentidadLegalPublica", () => {
  it("maps both rows to the camelCased DTO", async () => {
    const { client } = fakeIdentidadPublica({
      gymRow: { legal_name: "Gimnasio Forge, S.A. de C.V." },
      legalRow: {
        domicilio: "Av. Siempre Viva 123",
        email_arco: "datos@forge.mx",
        area_datos_personales: "Departamento de Datos Personales",
      },
    });
    expect(await getIdentidadLegalPublica("gym-1", client)).toEqual({
      razonSocial: "Gimnasio Forge, S.A. de C.V.",
      domicilio: "Av. Siempre Viva 123",
      emailArco: "datos@forge.mx",
      areaDatosPersonales: "Departamento de Datos Personales",
    });
  });

  it("returns an all-null DTO when neither row exists (identity not filled in yet)", async () => {
    const { client } = fakeIdentidadPublica({});
    expect(await getIdentidadLegalPublica("gym-1", client)).toEqual({
      razonSocial: null,
      domicilio: null,
      emailArco: null,
      areaDatosPersonales: null,
    });
  });

  it("degrades gracefully when only ONE side resolves (e.g. legal_name set, no gym_legal row yet)", async () => {
    const { client } = fakeIdentidadPublica({ gymRow: { legal_name: "Gimnasio Forge" }, legalRow: null });
    expect(await getIdentidadLegalPublica("gym-1", client)).toEqual({
      razonSocial: "Gimnasio Forge",
      domicilio: null,
      emailArco: null,
      areaDatosPersonales: null,
    });
  });

  it("scopes both reads to the gym id: gym.id and gym_legal.gym_id", async () => {
    const { client, eqCalls } = fakeIdentidadPublica({});
    await getIdentidadLegalPublica("gym-1", client);
    expect(eqCalls).toEqual(
      expect.arrayContaining([
        ["gym", "id", "gym-1"],
        ["gym_legal", "gym_id", "gym-1"],
      ]),
    );
  });

  // Minor 3 (final review round): fail-soft is unchanged (still degrades to incomplete), but a
  // read error must be distinguishable in the logs from the ordinary "not filled in yet" case —
  // same posture + shape as getAcuerdoAceptado's own warn line above.
  it("logs a structured warning when the gym read errors, but still degrades to null", async () => {
    const { client } = fakeIdentidadPublica({ gymError: { message: "connection reset" }, legalRow: null });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(await getIdentidadLegalPublica("gym-9", client)).toEqual({
      razonSocial: null,
      domicilio: null,
      emailArco: null,
      areaDatosPersonales: null,
    });
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(warn.mock.calls[0][0] as string)).toEqual({
      event: "identidad-legal-publica-read-error",
      table: "gym",
      gymId: "gym-9",
      error: "connection reset",
    });
    warn.mockRestore();
  });

  it("logs a structured warning when the gym_legal read errors, but still degrades to null", async () => {
    const { client } = fakeIdentidadPublica({ legalError: { message: "timeout" }, gymRow: null });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await getIdentidadLegalPublica("gym-9", client);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(JSON.parse(warn.mock.calls[0][0] as string)).toEqual({
      event: "identidad-legal-publica-read-error",
      table: "gym_legal",
      gymId: "gym-9",
      error: "timeout",
    });
    warn.mockRestore();
  });

  it("logs NOTHING on a clean read (no per-request noise for the ordinary case)", async () => {
    const { client } = fakeIdentidadPublica({});
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await getIdentidadLegalPublica("gym-1", client);
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
