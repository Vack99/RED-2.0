import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A typo'd/renamed route is a build error, not a runtime 404 (mirrors admin).
  typedRoutes: true,
  // The JIT @gym/* packages this app's graph pulls (ADR-0011 §1): brand (the
  // host→brand seam + modules), data (the browser Supabase factory), ui (the
  // Card primitive). They ship raw TS, so Next compiles them in its own boundary
  // instead of choking on un-built TypeScript. The client skeleton never imports
  // a subpath that reaches @gym/domain / @gym/format, so neither is in the graph.
  transpilePackages: ["@gym/brand", "@gym/data", "@gym/ui"],
};

export default nextConfig;
