import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Every runtime ./server module must carry the `server-only` poison-pill as its
// first import (ADR-0011 §5/§6). Pure carve-outs (no I/O — ADR-sanctioned) and
// test files/helpers are exempt. The check reads the FIRST import specifier, so
// quote style and semicolons don't matter (audit 2026-06-30, shield S1).
const SERVER_DIR = dirname(fileURLToPath(import.meta.url));

// Pure modules that legitimately ship without the pill (ADR-0011 §5).
const PURE_EXEMPT = new Set(["derive.ts", "plantilla-ctx.ts", join("export", "rows.ts")]);

function tsModules(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...tsModules(full));
    else if (entry.name.endsWith(".ts")) out.push(full);
  }
  return out;
}

function firstImportSpecifier(src: string): string | null {
  const noComments = src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|\n)\s*\/\/[^\n]*/g, "$1");
  const match = noComments.match(/\bimport\b[^;\n]*?["']([^"']+)["']/);
  return match ? match[1] : null;
}

const guarded = tsModules(SERVER_DIR)
  .map((file) => relative(SERVER_DIR, file))
  .filter((rel) => !rel.endsWith(".test.ts") && !rel.endsWith(".test-helper.ts"))
  .filter((rel) => !PURE_EXEMPT.has(rel));

describe("server-only poison-pill coverage", () => {
  it("guards a non-trivial set of modules (so the glob never silently empties)", () => {
    expect(guarded.length).toBeGreaterThanOrEqual(12);
  });

  it.each(guarded)("%s imports 'server-only' first", (rel) => {
    const spec = firstImportSpecifier(readFileSync(join(SERVER_DIR, rel), "utf8"));
    expect(spec, `${rel} must begin with import "server-only"`).toBe("server-only");
  });
});
