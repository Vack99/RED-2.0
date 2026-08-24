import { describe, expect, it } from "vitest";

import { esBorradoTotal, esSesionMuerta } from "./proxy";

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

/** Decides whether a parked teardown rides: only GoTrue codes that mean the
 *  refresh token is gone server-side (unrecoverable) let the wipe through.
 *  Every other failure — including non-retryable GoTrue 5xx — stays fail-soft. */
describe("esSesionMuerta", () => {
  it.each([
    "refresh_token_not_found",
    "refresh_token_already_used",
    "session_not_found",
    "session_expired",
  ])(
    "is true for the unrecoverable code %s",
    (code) => {
      expect(esSesionMuerta({ code })).toBe(true);
    },
  );

  it("is false for a transient GoTrue failure — the wipe stays suppressed", () => {
    expect(esSesionMuerta({ code: "unexpected_failure" })).toBe(false);
  });

  it("is false without an error or without a code", () => {
    expect(esSesionMuerta(null)).toBe(false);
    expect(esSesionMuerta(undefined)).toBe(false);
    expect(esSesionMuerta({})).toBe(false);
  });
});
