import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { DIAS_TIRA_INICIAL } from "./asistencia";

/**
 * Lockstep guard for the deliberately-duplicated 104-day window (Fix L2/naming).
 *
 * `getMarcadas`' INITIAL presence window here (`DIAS_TIRA_INICIAL`) must cover the day strip's
 * back-reach in the "use client" screen (apps/admin's asistencia.tsx), which duplicates the
 * value under the SAME name because it cannot import this `server-only` module. If they drift,
 * strip dots regress to blank off the far end. This test fails if EITHER side changes alone.
 *
 * This test lives in @gym/data (not apps/admin) on purpose: the eslint boundary forbids a
 * value-import of `@gym/data/server/*` from an apps client-component path, so the data-side
 * value is imported here as a real symbol, and the screen-side value is read from source TEXT
 * via fs — a plain file read, NOT a module import, so it crosses no dependency-cruiser edge
 * (packages must not import apps). Crude but boundary-clean, as the fix brief specifies.
 */
describe("asistencia 104-day window lockstep", () => {
  it("the screen's DIAS_TIRA_INICIAL equals @gym/data's DIAS_TIRA_INICIAL", () => {
    const screenPath = fileURLToPath(
      new URL(
        "../../../../apps/admin/src/app/(app)/asistencia/_components/asistencia.tsx",
        import.meta.url,
      ),
    );
    const screenSrc = readFileSync(screenPath, "utf8");
    const match = screenSrc.match(/export const DIAS_TIRA_INICIAL\s*=\s*(\d+)/);
    expect(match, "the screen must export a numeric `DIAS_TIRA_INICIAL`").not.toBeNull();
    expect(Number(match![1])).toBe(DIAS_TIRA_INICIAL);
  });
});
