import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  ANEXO_TRATAMIENTO_DATOS_TEXTO,
  ANEXO_TRATAMIENTO_DATOS_VERSION,
} from "../../packages/domain/src/legal";

// Gate 0.1 evidentiary guard (#254 review fix round 1). `aceptar_acuerdo` hashes and stores
// exactly the `ANEXO_TRATAMIENTO_DATOS_TEXTO` string a gym's owner is shown — but that constant
// is a hand-copied mirror of docs/legal/gate0-borradores/anexo-tratamiento-datos.md, and until
// this guard NOTHING machine-checked the two staying identical. Two failure modes it closes:
//
//  1. The .md changes (e.g. the abogado-reviewed text lands) and the constant is not re-copied —
//     the app would keep serving/hashing stale text forever, silently. V1 below.
//  2. The constant IS regenerated from a changed .md, but `ANEXO_TRATAMIENTO_DATOS_VERSION` is
//     not bumped — every gym that already accepted the OLD text would silently satisfy the
//     acceptance check for NEW, materially different text (the whole point of the
//     `(gym, documento, version)` uniqueness defeated). V2 below: the version is pinned NEXT TO
//     a literal sha256 of the current text, so a text change goes red until BOTH the hash pin
//     and (if the change is material) the version are deliberately touched together.
//
// Lives in tools/guards/ rather than packages/domain/ (the repo's home for this idiom of
// cross-checking a non-code source file against derived repo state — see docs.test.ts,
// denial-suite-drift.test.ts): @gym/domain's own vitest project has no reason to reach outside
// packages/domain/, and the constant has zero internal imports, so importing it here by a plain
// relative path needs no alias.
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ANEXO_MD = join(REPO, "docs/legal/gate0-borradores/anexo-tratamiento-datos.md");

// PINNED literal — NOT recomputed from the constant. If ANEXO_TRATAMIENTO_DATOS_TEXTO changes
// for any reason, this stops matching and the fix requires a deliberate edit to this line (and,
// if the change is material, to ANEXO_TRATAMIENTO_DATOS_VERSION below it).
const PINNED_SHA256 = "153bbd5c0af284e9bd247efdba54e4a285a4a29a253771736811966cd8aea18a";

describe("the Anexo domain constant never drifts from its source .md unnoticed", () => {
  it("ANEXO_TRATAMIENTO_DATOS_TEXTO is byte-for-byte the .md source", () => {
    // The constant is a template literal whose opening backtick is immediately followed by a
    // newline (the leading-newline offset), and every JS engine normalizes a template literal's
    // embedded CRLF/CR line terminators to LF (ECMA-262 11.8.6.1) regardless of the source
    // FILE's on-disk line endings (this repo checks out CRLF on Windows, core.autocrlf=true) —
    // both are accounted for here so this asserts real drift, not an encoding artifact.
    const source = readFileSync(ANEXO_MD, "utf8").replace(/\r\n/g, "\n");
    const expected = "\n" + source;
    expect(ANEXO_TRATAMIENTO_DATOS_TEXTO).toBe(expected);
  });

  it("the pinned content hash matches the constant — a text change must touch this pin", () => {
    const actual = createHash("sha256").update(ANEXO_TRATAMIENTO_DATOS_TEXTO, "utf8").digest("hex");
    expect(actual).toBe(PINNED_SHA256);
  });

  it("the version is still the pre-1.0 borrador tag — bumping it is a deliberate act, never a byproduct", () => {
    // "1.0" is reserved for the abogado-reviewed text (owner's #258 rollout call). This test is
    // not meant to stay green forever: when the version DOES bump, update this literal in the
    // SAME commit that updates PINNED_SHA256 above and the source .md — three deliberate edits,
    // never one alone.
    expect(ANEXO_TRATAMIENTO_DATOS_VERSION).toBe("0.1-borrador");
  });
});
