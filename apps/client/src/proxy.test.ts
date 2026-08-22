import { describe, expect, it } from "vitest";

import { esBorradoTotal, esPrefetch } from "./proxy";

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

  it("treats an absent value as a deletion", () => {
    expect(esBorradoTotal([{ name: "sb-auth-token.0" }])).toBe(true);
  });
});

/** The rotation skip. Next 16 strips `next-router-prefetch` before the proxy runs
 *  (see the helper's doc-comment), so this predicate is a contract, not a live path
 *  today — these cases pin the contract so it behaves the day the header arrives. */
describe("esPrefetch", () => {
  it("detects the App Router's next-router-prefetch header at any value", () => {
    expect(esPrefetch(new Headers({ "next-router-prefetch": "1" }))).toBe(true);
    expect(esPrefetch(new Headers({ "next-router-prefetch": "2" }))).toBe(true);
  });

  it("detects the purpose: prefetch hint", () => {
    expect(esPrefetch(new Headers({ purpose: "prefetch" }))).toBe(true);
  });

  it("is false for a real navigation", () => {
    expect(esPrefetch(new Headers({ host: "red.ibookit.lat", purpose: "" }))).toBe(false);
    expect(esPrefetch(new Headers())).toBe(false);
  });
});
