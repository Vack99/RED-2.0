import { readdirSync, readFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Shotgun-surgery guard for `@gym/data/server/fetch-shield`: the shield only bounds a stall
// at the sites that actually install it, and the FIFTH site (resolve-tenant's anon client)
// was missed on the first build — every root-layout render stayed unbounded. So: every
// SERVER Supabase construction call must pass `fetch: shieldedFetch`. Browser clients are
// out of scope (`createBrowserClient`, packages/data/src/client.ts) — a stall there is one
// tab, not the render path.
const REPO = join(fileURLToPath(import.meta.url), "..", "..", "..");
const ROOTS = ["apps/admin/src", "apps/client/src", "packages/data/src/server"];
const CONSTRUCTOR = /create(?:ServerClient|SupabaseClient)\s*[<(]/g;

function walk(dir: string): string[] {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name))
    .map((e) => join(e.parentPath, e.name));
}

describe("fetch-shield covers every server Supabase construction site", () => {
  it("each createServerClient/createSupabaseClient call installs `fetch: shieldedFetch`", () => {
    const unshielded = ROOTS.flatMap((root) => walk(join(REPO, root)))
      .map((file) => [relative(REPO, file).split(sep).join("/"), readFileSync(file, "utf8")] as const)
      .filter(([, src]) => {
        const built = src.match(CONSTRUCTOR)?.length ?? 0;
        return built > 0 && built !== src.split("fetch: shieldedFetch").length - 1;
      })
      .map(([rel]) => rel);
    expect(
      unshielded,
      "server Supabase client(s) built without `global: { fetch: shieldedFetch }` — a Supabase stall hangs that render for minutes (2026-08-29, ADR-0017)",
    ).toEqual([]);
  });
});
