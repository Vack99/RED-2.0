import { describe, expect, it } from "vitest";

import { readRpcFunctions } from "./denial-suite";

// Overload guard. On 2026-08-27 prod held TWO `registrar_venta`s — a repo migration `create or
// replace`d at a 14-arg signature that prod had already widened to 15 — and PostgREST, unable to
// choose between two candidates a payload matches, answered 300/PGRST203 to every sale for nine
// hours before any SQL ran. Nothing in `pnpm test` could see it: the replay was keyed by NAME, so
// the second overload simply overwrote the first.
//
// Signatures are now replayed (see readRpcFunctions), and this refuses the shape outright. PostgREST
// exposes `public` by NAME, so a second overload is never an intentional design here: either the
// migration meant to replace and used a stale argument list, or it must `drop` the old signature
// first. See docs/audits/2026-08-27-registrar-venta-overload-outage.md.
describe("public RPC overloads", () => {
  it("no function survives the migration replay with more than one signature", () => {
    const overloaded = readRpcFunctions()
      .filter((fn) => fn.signatures.length > 1)
      .map((fn) => `${fn.name}: ${fn.signatures.join("  |  ")}`)
      .sort();
    expect(
      overloaded,
      `RPC(s) left with more than one overload — PostgREST answers 300/PGRST203 to every call:\n${overloaded.join("\n")}`,
    ).toEqual([]);
  });
});
