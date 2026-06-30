import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // JIT internal packages ship raw TS (ADR-0011 §1): Next compiles them inside
  // its own boundary. @gym/format is the es-MX / Chihuahua-tz formatter leaf.
  transpilePackages: ["@gym/format"],
};

export default nextConfig;
