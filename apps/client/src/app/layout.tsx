import type { Metadata } from "next";
import { headers } from "next/headers";

import { brandCss, brands, DEFAULT_BRAND, type BrandId } from "@gym/brand";

import "./globals.css";
import { fetchTokenOverrides } from "../lib/token-overrides";

export const metadata: Metadata = {
  title: "Gym",
  description: "Panel del socio — plataforma multi-inquilino.",
};

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
  const stamped = (await headers()).get("x-brand");
  const brandId: BrandId =
    stamped !== null && Object.hasOwn(brands, stamped) ? (stamped as BrandId) : DEFAULT_BRAND;
  const brand = brands[brandId];
  const Logo = brand.logo;

  // `brandCss` serves the module baseline ⊕ the gym's `token_overrides` (grill
  // (b)): the app fetches the override DATA (the fixture seam this phase) and
  // passes it as an argument — `brandCss` validates it (zod-guarded before it
  // reaches this sink) and fast-paths to the precomputed baseline when empty.
  const css = brandCss(brand, fetchTokenOverrides(brandId));

  return (
    <html lang="es-MX">
      <head>
        <style dangerouslySetInnerHTML={{ __html: css }} />
      </head>
      <body>
        <header style={{ padding: "16px 20px", borderBottom: "1px solid var(--line)" }}>
          <Logo />
        </header>
        {children}
      </body>
    </html>
  );
}
