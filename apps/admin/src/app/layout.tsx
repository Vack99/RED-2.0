import type { Metadata, Viewport } from "next";
import { Outfit } from "next/font/google";
import { headers } from "next/headers";
import "./globals.css";
import { Providers } from "./providers";
import { ForgeToaster } from "@gym/ui/forge/toaster";
import { brands, DEFAULT_BRAND, type BrandId } from "@gym/brand";

// Outfit is the prototype's display/body face. Exposed as the CSS var
// `--font-outfit`, which globals.css wires into `--font-sans` and <body>.
const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Forge",
  description: "FORGE — administración del gimnasio.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  // No `maximumScale` — pinning it to 1 disables pinch-zoom (WCAG 1.4.4/1.4.10).
  // Modern mobile browsers no longer impose the legacy double-tap zoom delay, so
  // there's no reason to suppress user scaling.
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f2ed" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0a0a" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  // Brand seam (ADR-0012 §3): read the `x-brand` the proxy resolved (a dynamic
  // render for the brand read is accepted — ADR-0008) and SSR-inject that marca's
  // pre-serialized `:root` + `.dark` token block as a dark-safe `<style>`.
  // globals.css ships NO `:root` block, so this injected block is the SOLE definer
  // — the first byte is already branded (no FOUC). A `<style>` block, never
  // `<html style>`: inline custom-property specificity would beat `.dark{}` and
  // silently kill next-themes' class-based dark mode. `x-brand` is validated
  // against the registry before indexing — it arrives from an HTTP header, so an
  // absent/forged value falls back to DEFAULT_BRAND rather than crashing the render.
  const stamped = (await headers()).get("x-brand");
  const brandId: BrandId =
    stamped !== null && Object.hasOwn(brands, stamped) ? (stamped as BrandId) : DEFAULT_BRAND;

  // suppressHydrationWarning: next-themes sets the `class` on <html> before
  // hydration, so the server/client mismatch on that attribute is expected.
  return (
    <html lang="es-MX" className={outfit.variable} suppressHydrationWarning>
      <head>
        <style dangerouslySetInnerHTML={{ __html: brands[brandId].css }} />
      </head>
      <body className="antialiased">
        <Providers>
          {children}
          <ForgeToaster />
        </Providers>
      </body>
    </html>
  );
}
