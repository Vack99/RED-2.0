import type { ComponentType } from "react";

import type { BrandId } from "./brand-id";
import { ForgeLockup } from "./forge/logo";
import { forgeTokenCss } from "./forge/tokens";
import { RedLoginAnimation } from "./red/login-animation";
import { RedLockup } from "./red/logo";
import { redTokenCss } from "./red/tokens";

/**
 * A brand module (módulo de marca — CONTEXT.md): the concrete implementation of the
 * `@gym/ui` CSS-variable contract for one brand. It is CODE (rare, enumerable):
 * a pre-serialized token block + a logo, plus AT MOST one bespoke login animation
 * (the code-preset path). Presentation-only — never data, rules, or authz (ADR-0008).
 * No `BrandModule<T>` generic and no second theming layer: two concrete brands, so
 * a plain record IS the seam (ADR-0012 §4).
 */
export interface BrandModule {
  readonly id: BrandId;
  /** Pre-serialized `:root` + `.dark` token block, ready to SSR-inline as `<style>`. */
  readonly css: string;
  /** Brand lockup — recolors via the CSS-var contract. */
  readonly logo: ComponentType<{ size?: number }>;
  /** Bespoke login animation — RED ships one; Forge omits it. */
  readonly loginAnimation?: ComponentType;
}

/** The two brand modules Phase 2 ships (ADR-0012 §4). */
export const brands: Record<BrandId, BrandModule> = {
  forge: { id: "forge", css: forgeTokenCss, logo: ForgeLockup },
  red: { id: "red", css: redTokenCss, logo: RedLockup, loginAnimation: RedLoginAnimation },
};
