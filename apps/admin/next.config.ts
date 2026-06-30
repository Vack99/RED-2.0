import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // JIT internal packages ship raw TS (ADR-0011 §1); Next compiles them inside
  // its own boundary instead of treating the symlinked workspace package as an
  // opaque node_modules dependency. Transpiling @gym/data through Next's own
  // poison-aware pipeline is what keeps its `server-only` tripwire alive (§1/§5).
  transpilePackages: ["@gym/domain", "@gym/format", "@gym/data", "@gym/ui"],
};

export default nextConfig;
