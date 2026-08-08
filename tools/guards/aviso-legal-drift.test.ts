import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import {
  AVISO_PRIVACIDAD_INTEGRAL_TEXTO,
  AVISO_PRIVACIDAD_SIMPLIFICADO_TEXTO,
} from "../../packages/domain/src/legal";

// Gate 0.1 evidentiary guard (#255), same idiom as anexo-legal-drift.test.ts (#254). The CUENTA
// preview's `mergeAvisoTemplate` runs against `AVISO_PRIVACIDAD_INTEGRAL_TEXTO` /
// `AVISO_PRIVACIDAD_SIMPLIFICADO_TEXTO` — hand-copied mirrors of
// docs/legal/gate0-borradores/aviso-privacidad-{integral,simplificado}-template.md — and until this
// guard nothing machine-checked the two staying identical. Unlike the Anexo, these documents carry
// no acceptance/version concept (nobody clicks to accept an aviso, so there is no
// `(gym, documento, version)` uniqueness to protect and no version constant to pin) — the failure
// mode this closes is narrower: the .md changes and the constant is not re-copied, so the CUENTA
// preview would keep rendering stale text forever, silently.
//
// Lives in tools/guards/ (not packages/domain/) for the same reason anexo-legal-drift.test.ts does:
// this is the repo's home for "cross-check a non-code source file against derived repo state" (see
// denial-suite-drift.test.ts, docs.test.ts) — @gym/domain's own vitest project has no reason to
// reach outside packages/domain/, and the constants have zero internal imports.
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const INTEGRAL_MD = join(REPO, "docs/legal/gate0-borradores/aviso-privacidad-integral-template.md");
const SIMPLIFICADO_MD = join(REPO, "docs/legal/gate0-borradores/aviso-privacidad-simplificado-template.md");

// PINNED literals — NOT recomputed from the constants. If either TEXTO constant changes for any
// reason, its hash stops matching and the fix requires a deliberate edit to that pin.
const PINNED_SHA256_INTEGRAL = "c8d690f2ecf5c48848a1c94492840b04d06c08395c1c96c4d2f0b474eadaebcd";
const PINNED_SHA256_SIMPLIFICADO = "10bd2ee3a8cea4b71a900c5093cd21ad0b4ab28a2a11fada497c8f3bf9f224d9";

describe("the aviso integral domain constant never drifts from its source .md unnoticed", () => {
  it("AVISO_PRIVACIDAD_INTEGRAL_TEXTO is byte-for-byte the .md source", () => {
    // Same leading-newline / CRLF->LF normalization as anexo-legal-drift.test.ts: the template
    // literal's opening backtick is immediately followed by a newline, and every JS engine
    // normalizes a template literal's embedded CRLF/CR line terminators to LF (ECMA-262 11.8.6.1)
    // regardless of the source FILE's on-disk line endings (this repo checks out CRLF on Windows).
    const source = readFileSync(INTEGRAL_MD, "utf8").replace(/\r\n/g, "\n");
    expect(AVISO_PRIVACIDAD_INTEGRAL_TEXTO).toBe("\n" + source);
  });

  it("the pinned content hash matches the constant — a text change must touch this pin", () => {
    const actual = createHash("sha256").update(AVISO_PRIVACIDAD_INTEGRAL_TEXTO, "utf8").digest("hex");
    expect(actual).toBe(PINNED_SHA256_INTEGRAL);
  });
});

describe("the aviso simplificado domain constant never drifts from its source .md unnoticed", () => {
  it("AVISO_PRIVACIDAD_SIMPLIFICADO_TEXTO is byte-for-byte the .md source", () => {
    const source = readFileSync(SIMPLIFICADO_MD, "utf8").replace(/\r\n/g, "\n");
    expect(AVISO_PRIVACIDAD_SIMPLIFICADO_TEXTO).toBe("\n" + source);
  });

  it("the pinned content hash matches the constant — a text change must touch this pin", () => {
    const actual = createHash("sha256").update(AVISO_PRIVACIDAD_SIMPLIFICADO_TEXTO, "utf8").digest("hex");
    expect(actual).toBe(PINNED_SHA256_SIMPLIFICADO);
  });
});
