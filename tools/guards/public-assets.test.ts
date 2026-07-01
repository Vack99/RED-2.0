import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { workspaceDirs } from "./workspaces";

// dependency-cruiser's no-orphans rule is module-only — it can't see static
// assets, so dead files under public/ accumulate invisibly (the create-next-app
// SVGs did). This guard fails if any public asset is unreferenced from the app
// source (audit 2026-06-30, shield S11). It runs per app (apps/*), so a second
// app (apps/client) is guarded too; packages have no public/ (a Next-app concept).
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

// Next-magic public files that need no explicit reference.
const MAGIC = new Set(["robots.txt", "sitemap.xml", "manifest.webmanifest", "site.webmanifest", "sw.js"]);

function walk(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

describe("public/ has no orphaned assets", () => {
  it.each(workspaceDirs("apps"))("%s: every public asset is referenced from src", (app) => {
    const srcText = walk(join(REPO, app, "src"))
      .map((file) => readFileSync(file, "utf8"))
      .join("\n");
    const orphans = walk(join(REPO, app, "public"))
      .map((file) => ({ name: file.split(/[\\/]/).pop() ?? "", rel: relative(REPO, file) }))
      .filter((asset) => !MAGIC.has(asset.name) && !srcText.includes(asset.name))
      .map((asset) => asset.rel);
    expect(orphans, "unreferenced public asset(s) — delete them or reference them").toEqual([]);
  });
});
