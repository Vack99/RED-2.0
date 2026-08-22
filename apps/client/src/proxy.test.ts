import { describe, expect, it } from "vitest";

import { esBorradoTotal } from "./proxy";

/** The proxy's cookie-wipe guard. `setAll` batches come from `@supabase/ssr`'s
 *  `applyServerStorage`, which concatenates the chunk deletions it wants
 *  (`value: ""`, `maxAge: 0`) with the chunks it just minted. Only an ALL-deletions
 *  batch is a session teardown; a rotation that also sheds a surplus chunk is not,
 *  and suppressing that one would strand the member on a stale access token. The
 *  predicate reads `value` alone — `maxAge: 0` rides along but is never the test. */
describe("esBorradoTotal", () => {
  it("is true when every entry is a deletion — the failed-refresh teardown", () => {
    expect(
      esBorradoTotal([
        { name: "sb-auth-token.0", value: "" },
        { name: "sb-auth-token.1", value: "" },
      ]),
    ).toBe(true);
  });

  it("is false for a rotation that sheds a surplus chunk alongside fresh cookies", () => {
    expect(
      esBorradoTotal([
        { name: "sb-auth-token.2", value: "" },
        { name: "sb-auth-token.0", value: "base64-nuevo-0" },
        { name: "sb-auth-token.1", value: "base64-nuevo-1" },
      ]),
    ).toBe(false);
  });

  it("is false when nothing is a deletion", () => {
    expect(esBorradoTotal([{ name: "sb-auth-token.0", value: "base64-nuevo-0" }])).toBe(false);
  });

  it("is false for an empty batch — no write to suppress, no warning to emit", () => {
    expect(esBorradoTotal([])).toBe(false);
  });
});
