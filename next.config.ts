import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // JIT internal packages ship raw TS (ADR-0011 §1); Next compiles them inside
  // its own boundary instead of treating the symlinked workspace package as an
  // opaque node_modules dependency.
  transpilePackages: ["@gym/domain"],
};

export default nextConfig;
