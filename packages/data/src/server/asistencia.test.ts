import { describe, expect, it } from "vitest";

import { addDays, hoyEnZona, toIsoDay } from "@gym/format";

import {
  DIAS_TIRA_INICIAL,
  getMarcadas,
  getMarcadasDelDia,
  getMarcadasDeMes,
  togglePase,
} from "./asistencia";
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
 * `array_agg(distinct cliente_id)` for ids, the soft-delete filter, the half-open window) lives
 * DB-side in the SQL functions — invisible to vitest's RPC mock boundary by design (AGENTS.md:
 * the real contract for aggregation RPCs is proven by the SQL suites in `supabase/tests/`). What
 * stays testable here is the MECHANIC: the right RPC(s), the right args, the result shaped.
 *
 * Perf wave 5 split: getMarcadas ships per-day PRESENCE counts (dots) for the window PLUS the
 * ids for TODAY only; identity for any other day is lazy (getMarcadasDelDia). The fake returns
 * ONE seeded `opts.rpc.data` for every RPC in a call, so each test asserts the PROJECTION of
 * that seed it cares about (presence passthrough vs today's ids vs the window args).
 */

describe("getMarcadas — presence for the window + ids for today (injected fake)", () => {
  it("calls marcadas_presencia windowed AND marcadas_por_gym for today's 1-day window", async () => {
    const { client, rpcCalls } = makeFake({});

    await getMarcadas(client);

    // The initial window (perf wave 4): first-of-month(today − DIAS_TIRA_INICIAL) through the
    // first of NEXT month, in the gym's zone (the fake resolves America/Chihuahua).
    const hoy = hoyEnZona("America/Chihuahua");
    const desde = firstOfMonthIso(addDays(hoy, -DIAS_TIRA_INICIAL));
    const hasta = toIsoDay(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 1));
    const hoyIso = toIsoDay(hoy);
    const manana = toIsoDay(addDays(hoy, 1));

    expect(rpcCalls).toEqual([
      ["marcadas_presencia", { p_gym_id: "test-gym", p_desde: desde, p_hasta: hasta }],
      ["marcadas_por_gym", { p_gym_id: "test-gym", p_desde: hoyIso, p_hasta: manana }],
    ]);
    // Half-open and forward: the presence window covers the strip's far end; today is a 1-day slice.
    expect(desde < hasta).toBe(true);
    expect(hoyIso < manana).toBe(true);
  });

  it("returns the presence map verbatim as { presencia }", async () => {
    const presencia = { "2026-05-18": 2, "2026-05-20": 3 };
    const { client } = makeFake({}, { rpc: { data: presencia } });

    const { presencia: got } = await getMarcadas(client);

    expect(got).toEqual(presencia);
  });

  it("seeds TODAY's ids into marcadasDelDia (so the pase flow toggles without a fetch)", async () => {
    const hoyIso = toIsoDay(hoyEnZona("America/Chihuahua"));
    // The fake returns this for the today RPC too; getMarcadas projects out today's array.
    const { client } = makeFake({}, { rpc: { data: { [hoyIso]: ["a", "b"] } } });

    const { marcadasDelDia } = await getMarcadas(client);

    expect(marcadasDelDia).toEqual({ [hoyIso]: ["a", "b"] });
  });

  it("is best-effort — empty presence and empty today on RPC error", async () => {
    const hoyIso = toIsoDay(hoyEnZona("America/Chihuahua"));
    const { client } = makeFake({}, { rpc: { data: null, error: { message: "boom" } } });

    const { presencia, marcadasDelDia } = await getMarcadas(client);

    expect(presencia).toEqual({});
    expect(marcadasDelDia).toEqual({ [hoyIso]: [] });
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

describe("getMarcadasDelDia — one-day roster lazy load (injected fake)", () => {
  it("calls marcadas_por_gym over the day's 1-day window and returns just that day's ids", async () => {
    const { client, rpcCalls } = makeFake({}, { rpc: { data: { "2026-05-18": ["a", "b"] } } });

    const ids = await getMarcadasDelDia("2026-05-18", client);

    expect(rpcCalls).toEqual([
      ["marcadas_por_gym", { p_gym_id: "test-gym", p_desde: "2026-05-18", p_hasta: "2026-05-19" }],
    ]);
    expect(ids).toEqual(["a", "b"]);
  });

  it("rolls the upper bound across a month boundary", async () => {
    const { client, rpcCalls } = makeFake({});

    await getMarcadasDelDia("2026-05-31", client);

    expect(rpcCalls).toEqual([
      ["marcadas_por_gym", { p_gym_id: "test-gym", p_desde: "2026-05-31", p_hasta: "2026-06-01" }],
    ]);
  });

  it("returns [] when the day has no marks", async () => {
    const { client } = makeFake({}, { rpc: { data: { "2026-05-18": ["a"] } } });

    expect(await getMarcadasDelDia("2026-05-19", client)).toEqual([]);
  });

  it("rejects a malformed day before touching the DB", async () => {
    const { client, rpcCalls } = makeFake({});

    await expect(getMarcadasDelDia("2026-5-1", client)).rejects.toThrow();
    expect(rpcCalls).toEqual([]);
  });
});

describe("togglePase — typed outcome (injected fake)", () => {
  // Prod Next.js masks thrown Server Action messages (reconstructed client-side as a
  // generic English blob), so the RPC's operator-facing raises ('Paquete vencido', the
  // C15 session-managed guard) must travel as a RETURN VALUE for the toast to show them.
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

  it("maps a successful toggle to { ok: true, present, hora }", async () => {
    const { client } = makeFake({}, { rpc: { data: { present: true, hora: "07:30" } } });

    const res = await togglePase(input, client);

    expect(res).toEqual({ ok: true, present: true, hora: "07:30" });
  });
});
