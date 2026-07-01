import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// A turbo task that no workspace implements `turbo run`s to nothing and exits 0 —
// a false green that can silently drop a gate (the deleted lint/test/typecheck
// no-ops were exactly this). This guard fails if any non-root (`//#`) task lacks
// an implementing workspace script (audit 2026-06-30, shield S6).
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

function readJson(rel: string): { tasks?: Record<string, unknown>; scripts?: Record<string, string> } {
  return JSON.parse(readFileSync(join(REPO, rel), "utf8"));
}

const WORKSPACES = ["apps/admin", "packages/domain", "packages/format", "packages/data", "packages/ui"];

describe("turbo task graph", () => {
  it("every non-root turbo task is implemented by >=1 workspace script", () => {
    const tasks = Object.keys(readJson("turbo.json").tasks ?? {}).filter((t) => !t.startsWith("//#"));
    const scripts = new Set<string>();
    for (const ws of WORKSPACES) {
      for (const name of Object.keys(readJson(`${ws}/package.json`).scripts ?? {})) scripts.add(name);
    }
    const orphans = tasks.filter((t) => !scripts.has(t));
    expect(orphans, `turbo task(s) no workspace implements (would 'pass' having run nothing): ${orphans.join(", ")}`).toEqual(
      [],
    );
  });
});
