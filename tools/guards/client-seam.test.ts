import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// The ESLint client→server seam rule (eslint.config.mjs, shield S3) scopes to
// **/_components/** plus the two known top-level client files. This guard keeps
// that scope EXHAUSTIVE: any new 'use client' file outside it must be added to
// the ESLint `files` glob (or moved under _components/), else the seam rule
// silently stops covering it (audit 2026-06-30).
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const ADMIN_SRC = join(REPO, "apps/admin/src");

const ALLOWED_OUTSIDE_COMPONENTS = new Set([
  "apps/admin/src/app/providers.tsx",
  "apps/admin/src/app/(app)/template.tsx",
]);

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.tsx?$/.test(entry.name)) out.push(full);
  }
  return out;
}

const isClientComponent = (src: string): boolean => /^\s*["']use client["']/m.test(src);

describe("client→server seam scope stays exhaustive", () => {
  it("every 'use client' file is under _components/ or the ESLint allow-list", () => {
    const stray = walk(ADMIN_SRC)
      .filter((file) => isClientComponent(readFileSync(file, "utf8")))
      .map((file) => relative(REPO, file).split("\\").join("/"))
      .filter((rel) => !rel.includes("/_components/") && !ALLOWED_OUTSIDE_COMPONENTS.has(rel));
    expect(stray, "new client file(s) not covered by the eslint seam rule — extend its `files` glob or move under _components/").toEqual(
      [],
    );
  });
});
