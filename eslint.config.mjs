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
  ]),
]);

export default eslintConfig;
