import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { workspaceDirs } from "./workspaces";

// Workspace-manifest invariants the audit (2026-06-30, shield S5) turned from
// convention into a machine check: every internal package is ESM + private, the
// @gym/data server surface stays an explicit allow-list, every shared runtime/type
// lib is pinned via the pnpm catalog, and eslint-config-next tracks the catalog
// `next` version. Workspaces are discovered from the filesystem (apps/* + packages/*)
// so a new one (packages/brand, apps/client) is checked automatically.
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

type Manifest = {
  type?: string;
  private?: boolean;
  exports?: Record<string, unknown>;
  dependencies?: Record<string, string>;
  devDependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
  optionalDependencies?: Record<string, string>;
};

function readManifest(rel: string): Manifest {
  return JSON.parse(readFileSync(join(REPO, rel), "utf8")) as Manifest;
}

const PACKAGES = workspaceDirs("packages");
const MANIFESTS = [
  "package.json",
  ...workspaceDirs("apps", "packages").map((w) => `${w}/package.json`),
];

// Shared runtime/type libs imported by >=2 workspaces — must be `catalog:` so a
// future manual bump in one manifest can't diverge versions across importers.
const CATALOGED = new Set([
  "react",
  "react-dom",
  "next",
  "next-themes",
  "sonner",
  "@supabase/ssr",
  "@supabase/supabase-js",
  "@types/node",
  "@types/react",
  "@types/react-dom",
  "zod",
  "vitest",
  "typescript",
]);

describe("workspace package manifests", () => {
  it.each(PACKAGES)("%s declares type:module and private:true", (pkgDir) => {
    const pkg = readManifest(`${pkgDir}/package.json`);
    expect(pkg.type, `${pkgDir} must be ESM ("type":"module")`).toBe("module");
    expect(pkg.private, `${pkgDir} must be private`).toBe(true);
  });

  it("@gym/data exports an explicit allow-list (no ./server/* wildcard)", () => {
    const wildcards = Object.keys(readManifest("packages/data/package.json").exports ?? {}).filter((k) =>
      k.includes("*"),
    );
    expect(wildcards, "a wildcard re-exposes test files + the supabase fake as client entry points").toEqual([]);
  });

  it.each(MANIFESTS)("%s pins shared libs via catalog:", (manifest) => {
    const pkg = readManifest(manifest);
    const blocks = [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies, pkg.optionalDependencies];
    for (const block of blocks) {
      if (!block) continue;
      for (const [name, spec] of Object.entries(block)) {
        if (CATALOGED.has(name)) {
          expect(spec, `${manifest}: "${name}" must be "catalog:", not a literal "${spec}"`).toBe("catalog:");
        }
      }
    }
  });

  it("eslint-config-next stays in lockstep with the cataloged next version", () => {
    const ecn = readManifest("package.json").devDependencies?.["eslint-config-next"];
    const workspace = readFileSync(join(REPO, "pnpm-workspace.yaml"), "utf8");
    const catalogNext = workspace.match(/\n {2}next:\s*([^\s#]+)/);
    if (!catalogNext) throw new Error("catalog `next:` not found in pnpm-workspace.yaml");
    expect(ecn, "eslint-config-next must equal the catalog next version").toBe(catalogNext[1]);
  });
});
