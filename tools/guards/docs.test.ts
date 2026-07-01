import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// The navigation docs are auto-injected into every agent turn (CLAUDE.md →
// AGENTS.md), so stale paths/boundary actively mislead. This guard keeps them
// honest: every repo path they cite must exist, none may mention the deleted
// pre-monorepo src/ layout, AGENTS.md must state the real pre-commit command,
// and README.md must not regress to the create-next-app default (audit
// 2026-06-30, shield S8).
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (rel: string): string => readFileSync(join(REPO, rel), "utf8");

function citedRepoPaths(md: string): string[] {
  return (md.match(/`([^`]+)`/g) ?? [])
    .map((token) => token.slice(1, -1))
    .filter((token) => /^(apps|packages|docs|tools|\.github)\//.test(token))
    .filter((token) => !/[*{}<>]/.test(token)) // skip globs / placeholders
    .map((token) => token.replace(/\/$/, ""));
}

describe("navigation docs reflect the real repo", () => {
  it.each(["ARCHITECTURE.md", "CONTEXT.md"])("%s cites only paths that exist", (doc) => {
    const missing = citedRepoPaths(read(doc)).filter((p) => !existsSync(join(REPO, p)));
    expect(missing, `${doc} references non-existent path(s)`).toEqual([]);
  });

  it.each(["ARCHITECTURE.md", "AGENTS.md", "CONTEXT.md"])("%s drops the pre-monorepo src/ layout", (doc) => {
    const body = read(doc);
    for (const stale of ["src/domain", "src/lib", "src/components"]) {
      expect(body.includes(stale), `${doc} still mentions "${stale}"`).toBe(false);
    }
  });

  it("AGENTS.md states the real pre-commit command", () => {
    expect(read("AGENTS.md")).toContain("pnpm lint && pnpm typecheck && pnpm test");
  });

  it("README.md is not the create-next-app default", () => {
    const body = read("README.md");
    for (const marker of ["create-next-app", "app/page.tsx", "yarn dev", "bun dev"]) {
      expect(body.includes(marker), `README.md still contains "${marker}"`).toBe(false);
    }
  });
});
