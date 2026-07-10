import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // One root config lints the whole monorepo (ADR-0011 §7), but the Next app no
  // longer sits at the repo root — point the @next/next plugin at apps/admin so
  // its app-dir-aware rules resolve there instead of warning about a missing
  // pages/ directory at the root.
  { settings: { next: { rootDir: "apps/admin" } } },
  // Client→server seam guard (audit 2026-06-30, shield S3). dependency-cruiser
  // can't see 'use client', and the pure derive/plantilla-ctx modules carry no
  // `server-only` pill — so a client component that VALUE-imports @gym/data/server
  // would silently bundle server code. Restrict the 'use client' file set (every
  // _components/** file plus the two known top-level client files) to TYPE imports
  // of @gym/data/server. The guards/client-seam test keeps this list exhaustive.
  {
    files: [
      "apps/admin/src/**/_components/**/*.{ts,tsx}",
      "apps/admin/src/app/providers.tsx",
      "apps/admin/src/**/template.tsx",
    ],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["@gym/data/server", "@gym/data/server/*"],
              allowTypeImports: true,
              message:
                "Client components may import @gym/data/server only as `import type`. A value import bundles the server DAL into the client — call the DAL from a server component/action, or use @gym/data/client.",
            },
          ],
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next, un-anchored for the monorepo
    // (the Next build output now lives under apps/admin/).
    "**/.next/**",
    "**/out/**",
    "**/build/**",
    "**/next-env.d.ts",
    // Claude Code scratch: nested git worktrees carry their own node_modules + .next build output
    ".claude/**",
    // The Send Email Hook's Deno shell (#75): Deno runtime + esm.sh URL imports —
    // not resolvable by the monorepo toolchain. Its pure core (correo.ts) + tests
    // stay linted; only this thin shell is ignored.
    "supabase/functions/**/index.ts",
  ]),
]);

export default eslintConfig;
