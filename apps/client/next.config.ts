import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A typo'd/renamed route is a build error, not a runtime 404 (mirrors admin).
  typedRoutes: true,
  // The JIT @gym/* packages this app's graph pulls (ADR-0011 §1): brand (the
  // host→brand seam + modules), data (the DAL + browser Supabase factory), ui (the
  // Card primitive), format (es-MX peso strings — the Precios page money path).
  // They ship raw TS, so Next compiles them in its own boundary instead of choking
  // on un-built TypeScript.
  transpilePackages: ["@gym/brand", "@gym/data", "@gym/format", "@gym/ui"],
  // #149 item 1a: bearer material (`codigo`/`correo`) rides these invite/confirm URLs —
  // no-referrer keeps it out of a Referer header on any outbound navigation from them.
  async headers() {
    return [
      { source: "/activar", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
      { source: "/auth/confirm", headers: [{ key: "Referrer-Policy", value: "no-referrer" }] },
    ];
  },
};

export default nextConfig;
