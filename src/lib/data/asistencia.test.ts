import { describe, expect, it } from "vitest";

import { getMarcadas } from "./asistencia";
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
