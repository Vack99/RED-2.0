/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "domain-data-no-upward-ui",
      comment:
        "The domain core and data/lib layer must NEVER import UI or framework " +
        "code. Keeps the domain pure/testable and the data seam swappable " +
        "(ADR-0001/0002). If you hit this, the rule belongs in src/domain, not a screen.",
      severity: "error",
      from: { path: "^apps/admin/src/(domain|lib)" },
      to: { path: "^apps/admin/src/(components|app)" },
    },
    {
      name: "no-circular",
      comment: "Circular dependencies make the module graph impossible to reason about.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
    {
      name: "no-orphans",
      comment:
        "Every module must have a caller (or be an entry point) — no dead files. " +
        "The pathNot exceptions are genuine entry points the framework loads directly " +
        "(Next pages/layouts/templates/route handlers + the proxy), test files (run by " +
        "vitest), ambient type decls, and root config/dotfiles.",
      severity: "error",
      from: {
        orphan: true,
        pathNot: [
          "\\.d\\.ts$",
          "\\.(test|spec)\\.[jt]sx?$",
          "(^|/)apps/admin/src/proxy\\.ts$",
          "(^|/)apps/admin/src/app/.*(page|layout|template|loading|error|not-found|route|default|global-error)\\.[jt]sx?$",
          "(^|/)tsconfig",
          "(^|/)\\.[^/]+\\.(js|cjs|mjs|ts)$",
          "\\.config\\.[jt]s$",
          "\\.config\\.mjs$",
        ],
      },
      to: {},
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    // Resolve the @/* alias from tsconfig so import paths match the rules.
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
  },
};
