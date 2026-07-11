import type { ComponentType, ReactNode } from "react";

import { baseAppIcon } from "./base/app-icon";
import { BaseLockup } from "./base/logo";
import { baseTokens } from "./base/tokens";
import type { BrandId } from "./brand-id";
import { forgeAppIcon } from "./forge/app-icon";
import { ForgeLoginAnimation } from "./forge/login-animation";
import { ForgeLockup } from "./forge/logo";
import { forgeTokens } from "./forge/tokens";
import { redAppIcon } from "./red/app-icon";
import { RedLoginHero } from "./red/login-hero";
import { RedLockup } from "./red/logo";
import { redTokens } from "./red/tokens";
import { tokensToCss, type BrandTokens } from "./tokens";

/**
 * A brand module's closed brand-voice minimum (PRD grill lock (c)) — the
 * genuinely-code slice of brand identity. `name` feeds the metadata title,
 * the login wordmark, and "negocio" fallbacks; `description` feeds the
 * metadata description. Per-gym `brand_name` row data overrides `name` at
 * render wherever that path is wired (later slice) — `copy` itself stays code.
 */
export interface BrandCopy {
  readonly name: string;
  readonly description: string;
  /**
   * Optional brand-voice tagline — the neon under-logo line the landing renders in
   * the RED-only `.dark[data-brand="red"] .cm-vals` slot when present. Part of the
   * brand-voice minimum, so brands without a signature line simply omit it.
   */
  readonly tagline?: string;
}

/**
 * A brand module (módulo de marca — CONTEXT.md): the concrete implementation of the
 * `@gym/ui` CSS-variable contract for one brand. It is CODE (rare, enumerable):
 * structured tokens + a logo + copy, plus AT MOST one bespoke login animation
 * (the code-preset path). Presentation-only — never data, rules, or authz (ADR-0008).
 * No `BrandModule<T>` generic and no second theming layer: a small, enumerable set
 * of concrete brands, so a plain record IS the seam (ADR-0012 §4). Per-gym palette
 * personalization is DATA (`token_overrides`), merged onto a module baseline by
 * `brandCss` — not a new module (the *A escala* split; CONTEXT.md).
 */
export interface BrandModule {
  readonly id: BrandId;
  /** Structured light/dark fill of the CSS-variable contract (`./tokens`). */
  readonly tokens: BrandTokens;
  /** `tokensToCss(tokens)`, precomputed once at module load — ready to SSR-inline as `<style>`. */
  readonly css: string;
  /** The closed brand-voice minimum. */
  readonly copy: BrandCopy;
  /**
   * Brand lockup — recolors via the CSS-var contract. Static by default (chrome:
   * headers/footers/receipts); `animate` opts the landing/hero into a bespoke
   * ignition where a brand ships one (RED's neon ring). Static modules ignore the
   * flag — a single widened slot, not a second single-caller `heroMark` member.
   */
  readonly logo: ComponentType<{ size?: number; animate?: boolean }>;
  /**
   * Self-contained square app-icon SVG markup for the dynamic `/icon` favicon
   * route — flat token-value colors, no `var(--…)`/gradients (a favicon paints
   * with no page CSS). Built once at module load from the module's own tokens +
   * the single mark geometry source (`./{brand}/app-icon`).
   */
  readonly appIcon: string;
  /**
   * Bespoke login hero — a self-contained component carrying its own local
   * keyframes (grill lock (h)): Forge ships one (the bar-build sequence), RED
   * ships one (the ignition, composed with the form slot by `./red/login-hero`);
   * the neutral base module (later) omits it and the login falls back to a clean
   * static shell. `name` supplies the wordmark/aria from module copy; `children`
   * is the interactive login form, which every wired hero MUST render (a hero
   * that drops it ships a login with no way to sign in — that is what the RED
   * adapter exists to prevent). The form carries the Supabase seam that cannot
   * cross into @gym/brand.
   */
  readonly loginAnimation?: ComponentType<{ readonly name: string; readonly children?: ReactNode }>;
  /** Which token scheme the app SSR-stamps onto `<html>` by default. Omitted = light. */
  readonly defaultScheme?: "light" | "dark";
}

/**
 * The brand modules the platform ships (ADR-0012 §4): the neutral **base** (the
 * `DEFAULT_BRAND` — Phase 4), plus **forge** and **red**. The census is a
 * deliberate tripwire (`brand.test.ts`): a new module is a conscious code act.
 */
export const brands: Record<BrandId, BrandModule> = {
  base: {
    id: "base",
    tokens: baseTokens,
    css: tokensToCss(baseTokens),
    // Neutral es-MX placeholder voice, flagged for the HITL voice decision (grill (c)).
    copy: { name: "Gimnasio", description: "Gimnasio — plataforma multi-inquilino." },
    logo: BaseLockup,
    appIcon: baseAppIcon,
    // No `loginAnimation`: base exercises the optional-hero fallback (a clean
    // static login) — the neutral module never ships bespoke motion.
  },
  forge: {
    id: "forge",
    tokens: forgeTokens,
    css: tokensToCss(forgeTokens),
    copy: {
      name: "FORGE",
      description: "FORGE — administración del gimnasio.",
      tagline: "Aquí se forja tu mejor versión",
    },
    logo: ForgeLockup,
    appIcon: forgeAppIcon,
    loginAnimation: ForgeLoginAnimation,
    // Dark-only in the client (calm gold-on-black, the admin app's look) — the
    // whole scheme flip (#84). The client layout appends the `dark` class for
    // dark-default brands; the admin app runs its own theme provider (light +
    // toggle) and never reads this field, so the desk is untouched.
    defaultScheme: "dark",
  },
  red: {
    id: "red",
    tokens: redTokens,
    css: tokensToCss(redTokens),
    copy: {
      name: "RED",
      description: "RED — administración del gimnasio.",
      tagline: "Con beneficios de luz roja",
    },
    logo: RedLockup,
    appIcon: redAppIcon,
    loginAnimation: RedLoginHero,
    defaultScheme: "dark",
  },
};
