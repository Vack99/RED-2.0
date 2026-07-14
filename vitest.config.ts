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
        // @gym/brand — the two brand modules + the registry. The registry test
        // references (never renders) the logo/animation components, so node env is
        // enough; no aliases (imports are relative + `react` type-only).
        test: {
          name: "brand",
          environment: "node",
          include: ["packages/brand/**/*.test.ts"],
        },
      },
      {
        // apps/admin — app-local utils (auth/nav/swipe) plus the vender receipt
        // send seam (recibo-envio.test.ts). After the @/* alias was deleted (the
        // boundary cutover), every app import resolves via @gym/* workspace
        // specifiers or relative paths. The recibo-envio test pulls the @gym/data
        // ./server modules (recibo-mail), which keep the `import 'server-only'`
        // poison-pill, so stub that runtime guard with the same empty module the
        // @gym/data project uses — nothing calls createClient when a transport is
        // injected, so loading the chain is enough.
        test: {
          name: "admin",
          environment: "node",
          include: ["apps/admin/src/**/*.test.ts"],
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
        // apps/client — the socio's panel: app-local pure logic (auth-form
        // validation) plus the server-only Turnstile captcha verifier that guards
        // the public writes (contact-form intake + registration). Node env; the
        // verifier keeps the `import 'server-only'` poison-pill (it holds the
        // captcha secret), stubbed via the same empty module the @gym/data project
        // uses.
        test: {
          name: "client",
          environment: "node",
          include: ["apps/client/src/**/*.test.ts"],
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
        // supabase/functions — the Send Email Hook's pure decision core (#75).
        // `correo.ts` has zero imports and no Deno APIs, so node env covers it; the
        // Deno shell `index.ts` is excluded from tsc/eslint and carries no test.
        test: {
          name: "hooks",
          environment: "node",
          include: ["supabase/functions/**/*.test.ts"],
        },
      },
      {
        // Repo-structure guards (audit 2026-06-30): manifest/catalog consistency,
        // turbo-task implementation, docs-as-tests, public-asset orphans, and the
        // client→server seam convention. Pure fs reads, node env, no aliases.
        test: {
          name: "guards",
          environment: "node",
          include: ["tools/guards/**/*.test.ts"],
        },
      },
    ],
  },
});
