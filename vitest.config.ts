import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Root Vitest config (ADR-0011 §7): monorepo runs use `test.projects`, NOT the
// deprecated vitest.workspace.ts. S1–S5 split the tree into per-package projects;
// @gym/domain is the first extracted. The `server-only`→empty-stub alias follows
// the @gym/data project once the DAL is extracted.
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
          include: ["src/**/*.test.ts"],
        },
        resolve: {
          alias: {
            "@": fileURLToPath(new URL("./src", import.meta.url)),
            // The DAL is `server-only`; in tests it's exercised via the injected
            // fake client, so stub the runtime guard with the package's own
            // empty module.
            "server-only": fileURLToPath(
              new URL("./node_modules/server-only/empty.js", import.meta.url),
            ),
          },
        },
      },
    ],
  },
});
