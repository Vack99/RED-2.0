// @gym/brand — the shared brand home consumed by both apps (ADR-0012 §4). The `.`
// surface carries the brand-module registry (tokens + logo + optional animation);
// host→gym→brand resolution lives in `@gym/data`'s `resolveTenant` (ADR-0012 §5,
// amended).
export type { BrandId } from "./brand-id";
export { DEFAULT_BRAND } from "./brand-id";
export type { BrandModule } from "./registry";
export { brands } from "./registry";
// The module ⊕ token_overrides merge entry both layouts call (ADR-0012 §3, grill
// (b)); it validates the untrusted overrides argument before serializing.
export { brandCss } from "./brand-css";
