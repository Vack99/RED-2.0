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
      from: { path: "^src/(domain|lib)" },
      to: { path: "^src/(components|app)" },
    },
    {
      name: "no-circular",
      comment: "Circular dependencies make the module graph impossible to reason about.",
      severity: "error",
      from: {},
      to: { circular: true },
    },
  ],
  options: {
    doNotFollow: { path: "node_modules" },
    // Resolve the @/* alias from tsconfig so import paths match the rules.
    tsConfig: { fileName: "tsconfig.json" },
    tsPreCompilationDeps: true,
  },
};
// NOTE: `no-orphans` is intentionally omitted this phase — the freshly-created
// domain core is not yet wired into screens (that happens in the Supabase
// migration cycle). Enable it then, once everything has a caller.
