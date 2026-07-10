import { describe, expect, it } from "vitest";

import { getMarcadas, togglePase } from "./asistencia";
import { makeFake } from "./supabase-fake.test-helper";

/**
 * The seam this exercises: `getMarcadas` takes an injectable client (ADR-0001),
 * so its read ORCHESTRATION — the active-only `.is("deleted_at", null)` filter and
 * the PAGINATION that defeats PostgREST's per-response cap — is testable with the
 * shared chain-capturing fake (`./supabase-fake.test-helper`). No Supabase, no DB.
 *
 * `getMarcadas` returns the WHOLE attendance ledger as `{ "YYYY-MM-DD": clienteId[] }`
 * (the attendance day-strip + month calendar can browse any past month, so it must be
 * full history, not a date window). A single unbounded select silently caps at ~1000
 * rows, so once the gym exceeds ~1000 lifetime check-ins it drops attendance with NO
 * error — the bug F-001 fixes by paging through `.range()`.
 *
 * `.range(from, to)` returns the requested inclusive slice of the seeded list, so the
 * paginator's "loop until a short page returns" termination is exercised for real.
 */

const asistencia = (over: Record<string, unknown> = {}) => ({
  fecha: "2026-05-20",
  cliente_id: "cli-1",
  ...over,
});

describe("getMarcadas — full attendance map (injected fake)", () => {
  it("paginates past the PostgREST cap — returns ALL > PAGE rows, no truncation", async () => {
    // Seed 1001 asistencias — one past the PAGE (1000) cap — spread across several
    // days. A single unbounded read would silently drop the 1001st; the day-strip and
    // month calendar would lose attendance with no error.
    const dias = ["2026-05-18", "2026-05-19", "2026-05-20", "2026-05-21"];
    const asistencias = Array.from({ length: 1001 }, (_, i) =>
      asistencia({ fecha: dias[i % dias.length], cliente_id: `cli-${i}` }),
    );

    const { client, rangeCalls } = makeFake({ asistencias });

    const map = await getMarcadas(client);

    // (a) NO data is lost — the cliente_ids across all days sum to exactly 1001.
    const total = Object.values(map).reduce((n, ids) => n + ids.length, 0);
    expect(total).toBe(1001);

    // (b) it paginated — a full first page [0, 999] then the short second page
    // [1000, 1999] (1 row → loop terminates).
    expect(rangeCalls["asistencias"]).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
  });

  it("reads ALL surfaces — soft-delete only, NO class_session_id filter (ruling C15)", async () => {
    // C15: one attended class = one consumed class regardless of surface, so the map
    // must surface session-linked rows too (a member marked via the Agenda now shows
    // checked here). toggle_pase refuses the mistap instead of double-consuming, so
    // the class_session_id filter that used to hide those rows is gone.
    const { client, isCalls } = makeFake({ asistencias: [asistencia()] });

    await getMarcadas(client);

    expect(isCalls["asistencias"]).toEqual([["deleted_at", null]]);
  });

  it("marks BOTH a front-desk row and a session-linked row (ruling C15)", async () => {
    // A front-desk row (class_session_id null) and a session/Agenda row (class_session_id
    // set) on the same day — both cliente_ids must appear; neither surface is hidden.
    const { client } = makeFake({
      asistencias: [
        asistencia({ fecha: "2026-05-20", cliente_id: "front-desk", class_session_id: null }),
        asistencia({ fecha: "2026-05-20", cliente_id: "session", class_session_id: "sess-1" }),
      ],
    });

    const map = await getMarcadas(client);

    expect(map).toEqual({ "2026-05-20": ["front-desk", "session"] });
  });

  it("dedupes one cliente marked on BOTH surfaces the same day (count not inflated)", async () => {
    // The same cliente can hold a front-desk row AND a session row for one day; the
    // map must list them once so the pase screen's counts and marks aren't doubled.
    const { client } = makeFake({
      asistencias: [
        asistencia({ fecha: "2026-05-20", cliente_id: "both", class_session_id: null }),
        asistencia({ fecha: "2026-05-20", cliente_id: "both", class_session_id: "sess-1" }),
        asistencia({ fecha: "2026-05-21", cliente_id: "both", class_session_id: null }),
      ],
    });

    const map = await getMarcadas(client);

    expect(map).toEqual({ "2026-05-20": ["both"], "2026-05-21": ["both"] });
  });

  it("groups rows by fecha → correct per-day cliente_id lists (map shape)", async () => {
    const { client } = makeFake({
      asistencias: [
        asistencia({ fecha: "2026-05-18", cliente_id: "a" }),
        asistencia({ fecha: "2026-05-18", cliente_id: "b" }),
        asistencia({ fecha: "2026-05-19", cliente_id: "a" }),
        asistencia({ fecha: "2026-05-20", cliente_id: "c" }),
      ],
    });

    const map = await getMarcadas(client);

    expect(map).toEqual({
      "2026-05-18": ["a", "b"],
      "2026-05-19": ["a"],
      "2026-05-20": ["c"],
    });
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
