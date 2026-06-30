import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Root Vitest config (ADR-0011 §7): monorepo runs use `test.projects`, NOT the
// deprecated vitest.workspace.ts. The tree is split into per-package projects
// (domain, format, data, ui) plus `admin` for the apps/admin/src tree. The
// `server-only`→empty-stub alias lives with the @gym/data project — its ./server
// DAL keeps the `import 'server-only'` poison-pill, exercised via the supabase-fake.
export default defineConfig({
  test: {
    projects: [
      {
        // @gym/domain — pure rules + types, no aliases (relative imports, no
        // server-only). Its co-located rules.test.ts moved with the package.
        test: {
          name: "domain",
          environment: "node",
          include: ["packages/domain/**/*.test.ts"],
        },
      },
      {
        // @gym/format — pure leaf (es-MX / Chihuahua-tz formatters). No `@`
        // alias and no `server-only` stub: it imports nothing internal.
        test: {
          name: "format",
          environment: "node",
          include: ["packages/format/src/**/*.test.ts"],
        },
      },
      {
        // @gym/data — the server-only DAL + export/ + Supabase clients (ADR-0011
        // §5/§7). Each ./server module keeps `import 'server-only'`; the unit tests
        // inject the supabase-fake, so stub that runtime guard with the package's
        // own empty module. No `@` alias — the package uses relative + @gym/*
        // specifiers only.
        test: {
          name: "data",
          environment: "node",
          include: ["packages/data/**/*.test.ts"],
        },
        resolve: {
          alias: {
            "server-only": fileURLToPath(
              new URL(
                "./packages/data/node_modules/server-only/empty.js",
                import.meta.url,
              ),
            ),
          },
        },
      },
      {
        // @gym/ui — forge kit + motion/utils/viewport. Tests cover pure logic
        // (countUpStep, flipDelta, skeletonStyle, keyboardInset, the clases-picker
        // geometry, prefersReducedMotion via a stubbed matchMedia), so node env is
        // enough. Internal imports are relative; @gym/domain resolves via the
        // workspace, so no aliases.
        test: {
          name: "ui",
          environment: "node",
          include: ["packages/ui/**/*.test.ts"],
        },
      },
      {
        test: {
          name: "admin",
          environment: "node",
          include: ["apps/admin/src/**/*.test.ts"],
        },
        resolve: {
          alias: {
            "@": fileURLToPath(new URL("./apps/admin/src", import.meta.url)),
          },
        },
      },
    ],
  },
});
