import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

// Root Vitest config (ADR-0011 §7): monorepo runs use `test.projects`, NOT the
// deprecated vitest.workspace.ts. The tree is split into per-package projects
// (domain, format, data) plus `admin` for the remaining src/ tree. The
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
              new URL("./node_modules/server-only/empty.js", import.meta.url),
            ),
          },
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
          },
        },
      },
    ],
  },
});
