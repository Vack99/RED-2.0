import type { Metadata } from "next";
import { JetBrains_Mono, Outfit } from "next/font/google";

import { brandCss } from "@gym/brand";
import { createClient } from "@gym/data/server/supabase";

import "./globals.css";
import { PublicHeader } from "./_components/public-header";
import { brandHtmlSeam, resolveBrand } from "../lib/brand";
import { fetchTokenOverrides } from "../lib/token-overrides";

export const metadata: Metadata = {
  title: "Gym",
  description: "Panel del socio — plataforma multi-inquilino.",
};

// The RED mock's type system (Outfit = UI, JetBrains Mono = data/badges/eyebrows),
// self-hosted as WOFF2 at build time (CSP-safe — no Google Fonts request at
// runtime). Both are variable fonts, so the weight axis defaults to the full
// range (covers the mock's 300–800 / 400–700 spans) — mirrors apps/admin's
// Outfit setup. Exposed as CSS vars that globals.css wires into
// `--font-sans`/`--font-mono`.
const outfit = Outfit({
  subsets: ["latin"],
  variable: "--font-outfit",
  display: "swap",
});
const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

/**
 * Root layout — the no-FOUC brand seam (ADR-0012 §3). It reads the `x-brand` the
 * proxy already resolved (a dynamic render for the brand read is accepted —
 * ADR-0008) and SSR-injects that brand's pre-serialized `:root` + `.dark` token
 * block as a dark-safe `<style>` in `<head>`. globals.css ships NO `:root` block,
 * so this injected block is the SOLE definer of the brand contract — the first
 * byte is already branded (no client flash). A `<style>` block, never
 * `<html style={vars}>`: inline custom-property specificity would beat `.dark{}`
 * and silently kill class-based dark mode.
 *
 * `x-brand` is validated against the registry before indexing — it arrives from
 * an HTTP header, so an absent/forged
 * value falls back to DEFAULT_BRAND rather than crashing the render.
 */
export default async function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const brand = await resolveBrand();
  const Logo = brand.logo;

  // Signed-in state for the public header (Slice 2 / B5): `getClaims()`, never
  // `getSession()` (ADR-0001) — presentation only (which affordance to show),
  // never an authz decision.
  const supabase = await createClient();
  const { data } = await supabase.auth.getClaims();
  const signedIn = Boolean(data?.claims?.sub);

  // `brandCss` serves the module baseline ⊕ the gym's `token_overrides` (grill
  // (b)): the app fetches the override DATA (the fixture seam this phase) and
  // passes it as an argument — `brandCss` validates it (zod-guarded before it
  // reaches this sink) and fast-paths to the precomputed baseline when empty.
  const css = brandCss(brand, fetchTokenOverrides(brand.id));

  // Font vars always apply; the seam appends `dark` only for a dark-default brand
  // (kept alongside, never overwritten) and carries the `data-brand` the RED glow
  // selectors match, so Forge dark paints calm token base layers only (ADR-0012 §3).
  const { dataBrand, schemeClass } = brandHtmlSeam(brand);
  const htmlClassName = `${outfit.variable} ${jetbrainsMono.variable}${schemeClass}`;

  return (
    <html lang="es-MX" className={htmlClassName} data-brand={dataBrand}>
      <head>
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body className="min-h-dvh bg-canvas text-fg">
        {/* Shared public header (brand-token, no brand import in page code): the logo returns home,
            the Entrar link is the one always-available account entry point the mock's marketing
            screens carry in their scrhead — or, once signed in, the members' affordance instead
            (Slice 2 / B5). It hides itself on the auth routes, where the login hero owns the full
            viewport. */}
        <PublicHeader logo={<Logo />} signedIn={signedIn} />
        {children}
      </body>
    </html>
  );
}
