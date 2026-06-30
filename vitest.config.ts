import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Root Vitest config (ADR-0011 §7): monorepo runs use `test.projects`, NOT the
// deprecated vitest.workspace.ts. Today there is one project — the single `src/`
// tree; S1–S5 split it into per-package projects. The `server-only`→empty-stub
// alias follows the @gym/data project once the DAL is extracted.
export default defineConfig({
  test: {
    projects: [
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
