import type { ComponentType } from "react";

import type { BrandId } from "./brand-id";
import { ForgeLockup } from "./forge/logo";
import { forgeTokens } from "./forge/tokens";
import { RedLoginAnimation } from "./red/login-animation";
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
}

/**
 * A brand module (módulo de marca — CONTEXT.md): the concrete implementation of the
 * `@gym/ui` CSS-variable contract for one brand. It is CODE (rare, enumerable):
 * structured tokens + a logo + copy, plus AT MOST one bespoke login animation
 * (the code-preset path). Presentation-only — never data, rules, or authz (ADR-0008).
 * No `BrandModule<T>` generic and no second theming layer: two concrete brands, so
 * a plain record IS the seam (ADR-0012 §4).
 */
export interface BrandModule {
  readonly id: BrandId;
  /** Structured light/dark fill of the CSS-variable contract (`./tokens`). */
  readonly tokens: BrandTokens;
  /** `tokensToCss(tokens)`, precomputed once at module load — ready to SSR-inline as `<style>`. */
  readonly css: string;
  /** The closed brand-voice minimum. */
  readonly copy: BrandCopy;
  /** Brand lockup — recolors via the CSS-var contract. */
  readonly logo: ComponentType<{ size?: number }>;
  /** Bespoke login animation — RED ships one; Forge omits it. */
  readonly loginAnimation?: ComponentType;
}

/** The two brand modules Phase 2 ships (ADR-0012 §4). */
export const brands: Record<BrandId, BrandModule> = {
  forge: {
    id: "forge",
    tokens: forgeTokens,
    css: tokensToCss(forgeTokens),
    copy: { name: "FORGE", description: "FORGE — administración del gimnasio." },
    logo: ForgeLockup,
  },
  red: {
    id: "red",
    tokens: redTokens,
    css: tokensToCss(redTokens),
    copy: { name: "RED", description: "RED — administración del gimnasio." },
    logo: RedLockup,
    loginAnimation: RedLoginAnimation,
  },
};
