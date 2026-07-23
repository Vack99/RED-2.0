import { readdirSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

// Loading-state coverage guard (#148, map #137): every route the scope rule covers has a
// route-level loading.tsx, and no loading.tsx exists outside the pinned list. The second
// direction machine-enforces the map's "no root catch-alls" decision — a loading.tsx at an
// app root would silently become the fallback for every uncovered route (flash on sub-50ms
// screens), so an unpinned boundary anywhere under apps/ fails here and forces a review.
const COVERED = [
  "apps/admin/src/app/(app)/agenda/loading.tsx",
  "apps/admin/src/app/(app)/asistencia/loading.tsx",
  "apps/admin/src/app/(app)/clientes/[id]/loading.tsx",
  "apps/admin/src/app/(app)/clientes/loading.tsx",
  "apps/admin/src/app/(app)/cuenta/loading.tsx",
  "apps/admin/src/app/(app)/inicio/loading.tsx",
  "apps/admin/src/app/(app)/vender/loading.tsx",
  "apps/client/src/app/(home)/loading.tsx",
  "apps/client/src/app/clase/[sessionId]/loading.tsx",
  "apps/client/src/app/nosotros/loading.tsx",
  "apps/client/src/app/precios/loading.tsx",
  "apps/client/src/app/reservar/loading.tsx",
];

const repoRoot = join(fileURLToPath(import.meta.url), "..", "..", "..");
const appDirs = ["apps/admin/src/app", "apps/client/src/app"];

const onDisk = appDirs
  .flatMap((dir) =>
    readdirSync(join(repoRoot, dir), { recursive: true, withFileTypes: true })
      .filter((e) => e.isFile() && e.name === "loading.tsx")
      .map((e) => `${dir}/${relative(join(repoRoot, dir), join(e.parentPath, e.name)).split(sep).join("/")}`),
  )
  .sort();

describe("route loading-state coverage", () => {
  it("every covered route has its loading.tsx on disk", () => {
    const missing = COVERED.filter((f) => !onDisk.includes(f)).sort();
    expect(
      missing,
      `covered route(s) lost their loading.tsx — the screen freezes on navigation again: ${missing.join(", ")}`,
    ).toEqual([]);
  });

  it("no loading.tsx exists outside the pinned list (no unreviewed boundary, no root catch-all)", () => {
    const unpinned = onDisk.filter((f) => !COVERED.includes(f));
    expect(
      unpinned,
      `loading.tsx outside the pinned list — an app-root file would catch every uncovered route; pin it here after review: ${unpinned.join(", ")}`,
    ).toEqual([]);
  });
});
