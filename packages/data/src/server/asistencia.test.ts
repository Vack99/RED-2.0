import { describe, expect, it } from "vitest";

import { addDays, hoyEnZona, toIsoDay } from "@gym/format";

import {
  DIAS_TIRA_INICIAL,
  getAsistenciasResumenHoy,
  getMarcadas,
  getMarcadasDeMes,
  getReservasDelDia,
  getVisitasDelDia,
  togglePase,
} from "./asistencia";
import type { SupabaseServer } from "./supabase";
import { makeFake } from "./supabase-fake.test-helper";

/** First-of-month "YYYY-MM-DD" for a Date — the window-boundary shape getMarcadas sends. */
const firstOfMonthIso = (d: Date) => toIsoDay(new Date(d.getFullYear(), d.getMonth(), 1));

/**
 * The seam these exercise: each DAL fn takes an injectable client (ADR-0001), so its read
 * ORCHESTRATION — which RPC, called with which gym-scope AND window args, its result shaped
 * — is testable with the shared chain-capturing fake (`./supabase-fake.test-helper`). No
 * Supabase, no DB.
 *
 * The COUNTING/GROUPING/DEDUPE logic (per-fecha `count(distinct cliente_id)` for presence,
 * the soft-delete filter, the half-open window) lives DB-side in the SQL functions —
 * invisible to vitest's RPC mock boundary by design (AGENTS.md: the real contract for
 * aggregation RPCs is proven by the SQL suites in `supabase/tests/`). What stays testable
 * here is the MECHANIC: the right RPC(s), the right args, the result shaped.
 *
 * Perf wave 5 split, re-shaped by #89: getMarcadas ships per-day PRESENCE counts (dots) for
 * the window via RPC, PLUS today's per-VISIT rows via a direct `asistencias` select (the desk
 * is class-aware, so a set of cliente ids no longer carries enough). A picked past day is the
 * SAME read, fecha-parameterized (getVisitasDelDia) — one state model, no id-set variant. The
 * fake returns ONE seeded `opts.rpc.data` for every RPC in a call and one seeded row list per
 * table, so each test asserts the PROJECTION it cares about (presence passthrough vs the
 * visit rows vs the args).
 */

describe("getMarcadas — presence for the window + today's visits (injected fake)", () => {
  it("calls marcadas_presencia windowed AND selects today's asistencias rows directly", async () => {
    const { client, rpcCalls, eqCalls, isCalls, orderCalls } = makeFake({});

    await getMarcadas(client);

    // The initial window (perf wave 4): first-of-month(today − DIAS_TIRA_INICIAL) through the
    // first of NEXT month, in the gym's zone (the fake resolves America/Chihuahua).
    const hoy = hoyEnZona("America/Chihuahua");
    const desde = firstOfMonthIso(addDays(hoy, -DIAS_TIRA_INICIAL));
    const hasta = toIsoDay(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1));

    // ONE RPC now — today's leg is a plain table read, not marcadas_por_gym.
    expect(rpcCalls).toEqual([
      ["marcadas_presencia", { p_gym_id: "test-gym", p_desde: desde, p_hasta: hasta }],
    ]);
    // Half-open and forward: the presence window covers the strip's far end.
    expect(desde < hasta).toBe(true);
    // Today's visits: gym-scoped, today only, soft-delete filtered, stably ordered.
    expect(eqCalls.asistencias).toEqual([
      ["gym_id", "test-gym"],
      ["fecha", toIsoDay(hoy)],
    ]);
    expect(isCalls.asistencias).toEqual([["deleted_at", null]]);
    expect(orderCalls.asistencias).toEqual(["hora", "id"]);
  });

  it("returns the presence map verbatim as { presencia }", async () => {
    const presencia = { "2026-05-18": 2, "2026-05-20": 3 };
    const { client } = makeFake({}, { rpc: { data: presencia } });

    const { presencia: got } = await getMarcadas(client);

    expect(got).toEqual(presencia);
  });

  it("ships TODAY's rows as per-visit records carrying their class context and hora", async () => {
    const { client } = makeFake({
      asistencias: [
        { cliente_id: "c1", class_session_id: null, hora: "07:10:00" },
        { cliente_id: "c1", class_session_id: "s9", hora: "18:05:00" },
        { cliente_id: "c2", class_session_id: "s9", hora: null },
      ],
    });

    const { visitasHoy } = await getMarcadas(client);

    // Two rows for ONE member (two contexts) — the per-day boolean is gone (#89); `hora`
    // is trimmed to "HH:MM", and an untimed back-entered row stays null. No row `id`
    // crosses the boundary: a visit is keyed by (clienteId, context).
    expect(visitasHoy).toEqual([
      { clienteId: "c1", sessionId: null, hora: "07:10" },
      { clienteId: "c1", sessionId: "s9", hora: "18:05" },
      { clienteId: "c2", sessionId: "s9", hora: null },
    ]);
  });

  it("is best-effort — empty presence and no visits on error", async () => {
    const { client } = makeFake(
      { asistencias: [{ cliente_id: "c1", class_session_id: null, hora: "07:10:00" }] },
      { error: { table: "asistencias", err: { message: "boom" } }, rpc: { data: null, error: { message: "boom" } } },
    );

    const { presencia, visitasHoy } = await getMarcadas(client);

    expect(presencia).toEqual({});
    expect(visitasHoy).toEqual([]);
  });
});

describe("getReservasDelDia — the CON RESERVA grouping's source (injected fake)", () => {
  it("groups today's active bookings by session, gym-scoped, both statuses", async () => {
    const { client, eqCalls, inCalls } = makeFake({
      reservation: [
        { class_session_id: "s1", member_id: "c1", status: "reservada", is_walk_in: false },
        { class_session_id: "s1", member_id: "c2", status: "asistida", is_walk_in: true },
        { class_session_id: "s2", member_id: "c3", status: "reservada", is_walk_in: false },
      ],
    });

    const porSesion = await getReservasDelDia(["s1", "s2"], client);

    // `status`/`isWalkIn` ride along so the caller can tell the CON RESERVA grouping
    // (every row here) from the attribution candidate set (reservada, not walk-in).
    expect(porSesion).toEqual({
      s1: [
        { clienteId: "c1", status: "reservada", isWalkIn: false },
        { clienteId: "c2", status: "asistida", isWalkIn: true },
      ],
      s2: [{ clienteId: "c3", status: "reservada", isWalkIn: false }],
    });
    expect(eqCalls.reservation).toEqual([["gym_id", "test-gym"]]);
    // `asistida` counts too: the group keys on the BOOKING, not the check, so a marked
    // member must not fall out of CON RESERVA and move their row under the thumb.
    expect(inCalls.reservation).toEqual([
      ["class_session_id", ["s1", "s2"]],
      ["status", ["reservada", "asistida"]],
    ]);
  });

  it("short-circuits with no sessions — a gym with no schedule never queries", async () => {
    const { client, eqCalls } = makeFake({});

    expect(await getReservasDelDia([], client)).toEqual({});
    expect(eqCalls.reservation).toBeUndefined();
  });
});

describe("getMarcadasDeMes — one-month presence lazy load (injected fake)", () => {
  it("calls marcadas_presencia over the half-open month [firstOf(mes), firstOf(nextMes))", async () => {
    const { client, rpcCalls } = makeFake({});

    await getMarcadasDeMes("2026-05", client);

    expect(rpcCalls).toEqual([
      ["marcadas_presencia", { p_gym_id: "test-gym", p_desde: "2026-05-01", p_hasta: "2026-06-01" }],
    ]);
  });

  it("rolls the upper bound into the next YEAR for December", async () => {
    const { client, rpcCalls } = makeFake({});

    await getMarcadasDeMes("2026-12", client);

    expect(rpcCalls).toEqual([
      ["marcadas_presencia", { p_gym_id: "test-gym", p_desde: "2026-12-01", p_hasta: "2027-01-01" }],
    ]);
  });

  it("rejects a malformed month before touching the DB", async () => {
    const { client, rpcCalls } = makeFake({});

    await expect(getMarcadasDeMes("2026-5", client)).rejects.toThrow();
    expect(rpcCalls).toEqual([]);
  });

  it("returns the presence count map verbatim", async () => {
    const presencia = { "2026-05-18": 4 };
    const { client } = makeFake({}, { rpc: { data: presencia } });

    expect(await getMarcadasDeMes("2026-05", client)).toEqual(presencia);
  });
});

describe("getVisitasDelDia — one-day VISIT lazy load (injected fake)", () => {
  it("runs the same gym-scoped, soft-delete-filtered select the today-path uses, on that day", async () => {
    const { client, eqCalls, isCalls, orderCalls, rpcCalls } = makeFake({});

    await getVisitasDelDia("2026-05-18", client);

    // No RPC at all: a past day is the SAME direct table read as today (#89), never the
    // day-keyed `marcadas_por_gym` id map — one state model on both surfaces.
    expect(rpcCalls).toEqual([]);
    expect(eqCalls.asistencias).toEqual([
      ["gym_id", "test-gym"],
      ["fecha", "2026-05-18"],
    ]);
    expect(isCalls.asistencias).toEqual([["deleted_at", null]]);
    expect(orderCalls.asistencias).toEqual(["hora", "id"]);
  });

  it("shapes a past day's rows as visits — class context included, so class marks can't read as libre", async () => {
    const { client } = makeFake({
      asistencias: [
        { cliente_id: "c1", class_session_id: null, hora: null },
        { cliente_id: "c2", class_session_id: "s3", hora: "18:05:00" },
      ],
    });

    expect(await getVisitasDelDia("2026-05-18", client)).toEqual([
      { clienteId: "c1", sessionId: null, hora: null },
      { clienteId: "c2", sessionId: "s3", hora: "18:05" },
    ]);
  });

  it("is best-effort — [] on read error", async () => {
    const { client } = makeFake(
      { asistencias: [{ cliente_id: "c1", class_session_id: null, hora: null }] },
      { error: { table: "asistencias", err: { message: "boom" } } },
    );

    expect(await getVisitasDelDia("2026-05-18", client)).toEqual([]);
  });

  it("rejects a malformed day before touching the DB", async () => {
    const { client, eqCalls } = makeFake({});

    await expect(getVisitasDelDia("2026-5-1", client)).rejects.toThrow();
    expect(eqCalls.asistencias).toBeUndefined();
  });
});

describe("togglePase — typed outcome (injected fake)", () => {
  // Prod Next.js masks thrown Server Action messages (reconstructed client-side as a
  // generic English blob), so the RPC's operator-facing raises ('Paquete vencido', the C9
  // vence gate) must travel as a RETURN VALUE for the toast to show them.
  const input = { clienteId: "cli-1", fecha: "2026-07-10" };

  it("maps an RPC refusal to { ok: false, message } carrying the RPC's own raise", async () => {
    const { client } = makeFake({}, { rpc: { error: { message: "Paquete vencido" } } });

    const res = await togglePase(input, client);

    expect(res).toEqual({ ok: false, message: "Paquete vencido" });
  });

  it("falls back to the generic message when the failure carries none", async () => {
    const { client } = makeFake({}, { rpc: { error: { message: "" } } });

    const res = await togglePase(input, client);

    expect(res).toEqual({ ok: false, message: "No se pudo registrar la asistencia" });
  });

  it("maps a successful ACCESO LIBRE toggle to { ok: true, present, hora, sessionId: null, clasesRestantes, resultado }", async () => {
    const { client } = makeFake(
      {},
      {
        rpc: {
          data: { present: true, hora: "07:30", session_id: null, clases_restantes: 4, resultado: "descontada" },
        },
      },
    );

    const res = await togglePase(input, client);

    // toStrictEqual (not toEqual): the RPC's shape gained `resultado` (#233/#246) and a
    // fixture that omits it would still pass toEqual (undefined keys are ignored), silently
    // uncovering the passthrough this test exists to guard.
    expect(res).toStrictEqual({
      ok: true,
      present: true,
      hora: "07:30",
      sessionId: null,
      clasesRestantes: 4,
      resultado: "descontada",
    });
  });

  it("surfaces the ATTRIBUTED session when the RPC lands a LIBRE tap on the member's booking", async () => {
    // The desk sent no sessionId; the RPC found a booking whose arrival window contains
    // now and marked THAT class instead (ruling 2026-07-29). The landing context has to
    // reach the caller, or the desk would show the mark in the wrong place.
    const { client } = makeFake(
      {},
      {
        rpc: {
          data: { present: true, hora: "18:02", session_id: "ses-9", clases_restantes: null, resultado: "reserva" },
        },
      },
    );

    const res = await togglePase(input, client);

    // toStrictEqual — see the note on the previous test.
    expect(res).toStrictEqual({
      ok: true,
      present: true,
      hora: "18:02",
      sessionId: "ses-9",
      clasesRestantes: null,
      resultado: "reserva",
    });
  });

  it("omits p_session_id entirely for an ACCESO LIBRE mark", async () => {
    // Not `p_session_id: undefined` — an ABSENT argument is what selects the function's
    // own NULL default, i.e. the class-less visit kind (#89).
    const { client, rpcCalls } = makeFake({}, { rpc: { data: { present: true, hora: "07:30" } } });

    await togglePase(input, client);

    expect(rpcCalls).toEqual([
      ["toggle_pase", { p_cliente_id: "cli-1", p_fecha: "2026-07-10" }],
    ]);
  });

  it("passes sessionId through as p_session_id — the desk marking inside a class", async () => {
    const { client, rpcCalls } = makeFake({}, { rpc: { data: { present: true, hora: "07:30" } } });
    const sessionId = "3f9d1c2e-5a4b-4c8d-9e1f-2a3b4c5d6e7f";

    await togglePase({ ...input, sessionId }, client);

    expect(rpcCalls).toEqual([
      ["toggle_pase", { p_cliente_id: "cli-1", p_fecha: "2026-07-10", p_session_id: sessionId }],
    ]);
  });

  it("rejects a non-uuid sessionId before touching the DB", async () => {
    const { client, rpcCalls } = makeFake({});

    await expect(togglePase({ ...input, sessionId: "not-a-uuid" }, client)).rejects.toThrow();
    expect(rpcCalls).toEqual([]);
  });
});

/**
 * The Lista home's ASISTENCIAS · HOY hero (owner ruling 2026-09-01, restoring what #328
 * dropped) — a hand-rolled fake, not `./supabase-fake.test-helper`'s shared one, because
 * the shared fake's `.eq()`/`.is()` RECORD filters without narrowing the seeded list
 * (its own doc comment), which would make every one of the 7 daily counts read back
 * identical — unable to prove hoy/ayer/semana are actually distinct per-day reads. This
 * mirrors `modo-reservas.test.ts`'s own hand-rolled count fake for the same reason.
 */
describe("getAsistenciasResumenHoy — 7 concurrent COUNTs, never a row fetch (owner ruling 2026-09-01)", () => {
  const GYM_ROW = {
    gym_id: "gym-1",
    gym: { timezone: "America/Chihuahua", slug: "forge", brand_name: "Forge", booking_enabled: false },
  };

  function makeConteoFake(porFecha: Record<string, number>) {
    const eqCalls: [string, unknown][] = [];
    const isCalls: [string, unknown][] = [];
    const selectCalls: [string, { count?: string; head?: boolean } | undefined][] = [];

    function asistenciasBuilder() {
      let fecha: string | undefined;
      const b = {
        select: (columns: string, options?: { count?: string; head?: boolean }) => {
          selectCalls.push([columns, options]);
          return b;
        },
        eq: (col: string, val: unknown) => {
          eqCalls.push([col, val]);
          if (col === "fecha") fecha = val as string;
          return b;
        },
        is: (col: string, val: unknown) => {
          isCalls.push([col, val]);
          return b;
        },
        then: (resolve: (v: { data: null; count: number; error: null }) => unknown) =>
          resolve({ data: null, count: fecha ? (porFecha[fecha] ?? 0) : 0, error: null }),
      };
      return b;
    }

    const client = {
      auth: { getClaims: async () => ({ data: { claims: { sub: "op-1" } } }) },
      from: (table: string) => {
        if (table === "asistencias") return asistenciasBuilder();
        if (table === "gym_membership")
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
        throw new Error(`getAsistenciasResumenHoy fake: unexpected table "${table}"`);
      },
    };

    return { client: client as unknown as SupabaseServer, eqCalls, isCalls, selectCalls };
  }

  it("issues 7 gym-scoped server-side COUNTs, excluding perdonada + soft-deleted rows — never a row list", async () => {
    const { client, eqCalls, isCalls, selectCalls } = makeConteoFake({});

    await getAsistenciasResumenHoy(client);

    // `{ count: "exact", head: true }` on every call — the PostgREST server-side count,
    // not a row-length read (mirrors `contarReservasFuturas`'s own asserted shape).
    expect(selectCalls).toEqual(Array.from({ length: 7 }, () => ["id", { count: "exact", head: true }]));
    expect(eqCalls.filter(([c, v]) => c === "gym_id" && v === "gym-1")).toHaveLength(7);
    expect(eqCalls.filter(([c, v]) => c === "perdonada" && v === false)).toHaveLength(7);
    expect(isCalls.filter(([c, v]) => c === "deleted_at" && v === null)).toHaveLength(7);
  });

  it("shapes hoy/ayer off the tail of a 7-day series ending TODAY (index 6 = hoy, 5 = ayer)", async () => {
    const hoy = hoyEnZona("America/Chihuahua");
    const iso = (offset: number) => toIsoDay(addDays(hoy, offset));
    const { client } = makeConteoFake({
      [iso(-6)]: 1,
      [iso(-5)]: 2,
      [iso(-4)]: 3,
      [iso(-3)]: 4,
      [iso(-2)]: 5,
      [iso(-1)]: 6,
      [iso(0)]: 7,
    });

    const resumen = await getAsistenciasResumenHoy(client);

    expect(resumen).toEqual({ hoy: 7, ayer: 6, semana: [1, 2, 3, 4, 5, 6, 7] });
  });

  it("defaults every uncounted day to 0", async () => {
    const { client } = makeConteoFake({});
    await expect(getAsistenciasResumenHoy(client)).resolves.toEqual({
      hoy: 0,
      ayer: 0,
      semana: [0, 0, 0, 0, 0, 0, 0],
    });
  });
});
