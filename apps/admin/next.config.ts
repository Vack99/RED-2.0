import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Compile-time route checking: a typo'd or renamed route in a <Link>,
  // router.push/replace, or redirect() is a build error, not a runtime 404
  // (audit 2026-06-30). Enforced at `next build` (typegen runs there), which is
  // the authoritative route-type gate.
  typedRoutes: true,
  // JIT internal packages ship raw TS (ADR-0011 §1); Next compiles them inside
  // its own boundary instead of treating the symlinked workspace package as an
  // opaque node_modules dependency. Transpiling @gym/data through Next's own
  // poison-aware pipeline is what keeps its `server-only` tripwire alive (§1/§5).
  transpilePackages: ["@gym/domain", "@gym/format", "@gym/data", "@gym/ui", "@gym/brand"],
};

export default nextConfig;
