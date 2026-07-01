import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// Shared workspace discovery for the guard shields. The Phase-1 guards hardcoded
// `apps/admin` + a fixed package list; enumerating from the filesystem instead
// means any new workspace (packages/brand now, apps/client later) is guarded the
// moment it lands — never silently exempt from a stale hardcoded array.
const REPO = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Repo-relative dirs under `apps` / `packages` that carry a package.json (a real workspace). */
export function workspaceDirs(...areas: ("apps" | "packages")[]): string[] {
  return areas.flatMap((area) => {
    const base = join(REPO, area);
    if (!existsSync(base)) return [];
    return readdirSync(base, { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(join(base, e.name, "package.json")))
      .map((e) => `${area}/${e.name}`);
  });
}
