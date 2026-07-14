import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { brandCss } from "@gym/brand";
import "./globals.css";
import { Providers } from "./providers";
import { Toaster } from "@gym/ui/toaster";
import { resolveBrand } from "../lib/brand";
import { fetchTokenOverrides } from "../lib/token-overrides";

// Outfit is the prototype's display/body face. Exposed as the CSS var
// `--font-outfit`, which globals.css wires into `--font-sans` and <body>.
const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

// Title/description come from the resolved marca's copy (grill lock (c)) — no
// hardcoded "Forge". Dynamic because it reads the request's `x-brand`.
export async function generateMetadata(): Promise<Metadata> {
  const { copy } = await resolveBrand();
  return { title: copy.name, description: copy.description };
}

// theme-color is derived from the marca's `canvas` token (light + dark) rather
// than hardcoded hexes (grill lock (g)) — a RED tab paints RED's canvas, a Forge
// tab paints Forge's (identical to the previous literals).
export async function generateViewport(): Promise<Viewport> {
  const { tokens } = await resolveBrand();
  return {
    width: "device-width",
    initialScale: 1,
    // No `maximumScale` — pinning it to 1 disables pinch-zoom (WCAG 1.4.4/1.4.10).
    // Modern mobile browsers no longer impose the legacy double-tap zoom delay, so
    // there's no reason to suppress user scaling.
    themeColor: [
      { media: "(prefers-color-scheme: light)", color: tokens.light.canvas },
      { media: "(prefers-color-scheme: dark)", color: tokens.dark.canvas },
    ],
  };
}

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Brand seam (ADR-0012 §3): read the `x-brand` the proxy resolved (a dynamic
  // render for the brand read is accepted — ADR-0008) and SSR-inject that marca's
  // pre-serialized `:root` + `.dark` token block as a dark-safe `<style>`.
  // globals.css ships NO `:root` block, so this injected block is the SOLE definer
  // — the first byte is already branded (no FOUC). A `<style>` block, never
  // `<html style>`: inline custom-property specificity would beat `.dark{}` and
  // silently kill next-themes' class-based dark mode. `resolveBrand` validates the
  // `x-brand` header against the registry (absent/forged → DEFAULT_BRAND).
  //
  // `brandCss` serves the module baseline ⊕ the gym's `token_overrides` (grill
  // (b)): the app fetches the override DATA (the fixture seam this phase) and
  // passes it as an argument — `brandCss` validates it (zod-guarded before it
  // reaches this sink) and fast-paths to the precomputed baseline when empty.
  const brand = await resolveBrand();
  const css = brandCss(brand, fetchTokenOverrides(brand.id));

  // `data-brand` is the hook the brand's own stylesheets select on (@gym/brand's
  // red/neon.css). Without it the RED hero's neon classes are inert here and its
  // tagline paints as plain unstyled text — the client app has stamped it since
  // ADR-0012 §3; this app renders the same brand heroes and needs the same hook.
  //
  // suppressHydrationWarning: next-themes sets the `class` on <html> before
  // hydration, so the server/client mismatch on that attribute is expected.
  return (
    <html
      lang="es-MX"
      className={outfit.variable}
      data-brand={brand.id}
      suppressHydrationWarning
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body className="antialiased">
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  );
}
