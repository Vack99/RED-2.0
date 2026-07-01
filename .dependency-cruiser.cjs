/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "core-no-presentation-or-app",
      comment:
        "The pure/server tiers (@gym/domain, @gym/format, @gym/data) must NEVER " +
        "import the UI kit (@gym/ui) or any app (apps/*). This is the direct heir " +
        "of the old domain|lib ✗→ components|app arrow, carried across package " +
        "lines (ADR-0011 §6): the rules stay pure/testable and the data seam stays " +
        "swappable (ADR-0001/0002). If you hit this, the rule belongs down in the " +
        "pure tier, not up in a screen.",
      severity: "error",
      from: { path: "^packages/(domain|format|data)/" },
      to: { path: "^(packages/ui|apps)/" },
    },
    {
      name: "domain-imports-nothing-internal",
      comment:
        "@gym/domain is the innermost leaf — pure gym rules + types — and imports " +
        "no other internal package (ADR-0011 §4/§6) and has zero runtime dependencies. " +
        "Anything domain needs from @gym/format or @gym/data is a sign the rule is " +
        "in the wrong tier.",
      severity: "error",
      from: { path: "^packages/domain/" },
      to: { path: "^packages/(format|data)/" },
    },
    {
      name: "format-is-a-pure-leaf",
      comment:
        "@gym/format is a pure es-MX / Chihuahua-tz formatting leaf — imported BY " +
        "the DAL and the UI kit, but importing nothing internal itself (ADR-0011 " +
        "§4/§6). Keeping it a leaf is precisely what lets @gym/data consume it " +
        "without a forbidden data→ui back-edge.",
      severity: "error",
      from: { path: "^packages/format/" },
      to: { path: "^packages/(domain|data)/" },
    },
    {
      name: "ui-reaches-only-pure-leaves",
      comment:
        "@gym/ui (the forge primitive kit) may import the pure leaves (@gym/domain, " +
        "@gym/format) but NEVER the data seam (@gym/data) or an app (apps/*). The " +
        "ui ✗→ data edge is one of the three real guards on the server seam " +
        "(ADR-0011 §6) — dependency-cruiser can't see 'use client', so the " +
        "server-only poison-pill + the @gym/data ./server÷./client split carry the " +
        "rest. Formatters belong in @gym/format, never re-homed into the UI kit.",
      severity: "error",
      from: { path: "^packages/ui/" },
      to: { path: "^(packages/data|apps)/" },
    },
    {
      name: "brand-is-presentation-only",
      comment:
        "@gym/brand holds presentation-only brand modules (tokens + logo + at most " +
        "one bespoke animation). It must NEVER import @gym/data or @gym/domain — the " +
        "host resolves brand (presentation) but never authz or rules (ADR-0008/0012), " +
        "so brand carries no data seam or gym rule. It MAY consume the pure @gym/format " +
        "leaf and be consumed by @gym/ui / apps (ADR-0011 §6). This is the §6 edge that " +
        "lands with packages/brand.",
      severity: "error",
      from: { path: "^packages/brand/" },
      to: { path: "^packages/(data|domain)/" },
    },
    {
      name: "no-undeclared-npm-deps",
      comment:
        "Import only npm packages this workspace declares in its own package.json " +
        "(ADR-0011 §3: pnpm's isolated linker — a phantom dependency is fixed by " +
        "DECLARING it, never by relaxing hoisting). Catches e.g. a test importing " +
        "vitest a package never listed in its devDependencies.",
      severity: "error",
      from: {},
      to: { dependencyTypes: ["npm-no-pkg"] },
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
        "The pathNot exceptions are genuine entry points the framework loads " +
        "directly (any app's Next pages/layouts/templates/route handlers + its " +
        "proxy), test files (run by vitest), ambient type decls, and root " +
        "config/dotfiles. The app-entry patterns match apps/* (not just apps/admin) " +
        "so a second app (apps/client) is not silently flagged.",
      severity: "error",
      from: {
        orphan: true,
        pathNot: [
          "\\.d\\.ts$",
          "\\.(test|spec)\\.[jt]sx?$",
          "(^|/)apps/[^/]+/src/proxy\\.ts$",
          "(^|/)apps/[^/]+/src/app/.*(page|layout|template|loading|error|not-found|route|default|global-error)\\.[jt]sx?$",
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
    // Scan apps/* + packages/* but skip third-party code and build output; the
    // @gym/* workspace specifiers resolve to their real packages/<name>/src paths
    // (symlinks resolved), so the cross-package edges above are evaluated on the
    // real source graph.
    exclude: { path: "(^|/)(node_modules|\\.next|\\.turbo)(/|$)" },
    doNotFollow: { path: "node_modules" },
    // Point at the shared base (ADR-0011 §6/§7). It carries no path aliases — the
    // @/* alias was deleted in the cutover; every import now resolves via @gym/*
    // workspace specifiers or relative paths.
    tsConfig: { fileName: "tsconfig.base.json" },
    // The @gym/* packages expose raw TS via `exports` only (no `main`, JIT — ADR-
    // 0011 §1), so the resolver must read the exports field to follow them into
    // packages/<name>/src instead of giving up at the bare specifier.
    enhancedResolveOptions: { exportsFields: ["exports"] },
    tsPreCompilationDeps: true,
  },
};
