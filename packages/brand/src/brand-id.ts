/**
 * The brands (marcas) Phase 2 ships. The atomic tenant-presentation key shared by
 * the host-map (resolution input) and the brand-module registry (presentation) —
 * neither owns it, so it lives here alone, free of any React/presentation import.
 * Phase 3 SPLITS the keyspaces: tenant (gym) slugs become an open DB-backed set, and
 * many gyms map onto one of these enumerable module keys (ADR-0012 Consequences) —
 * the slug↔BrandId equality holds in Phase 2 only.
 */
export type BrandId = "forge" | "red" | "base";

/**
 * Fallback brand when no host-map hit and no valid `?gym=` override resolves — the
 * lowest-precedence arm of host→brand (ADR-0012 §1), and the one fallback knob both
 * pinned contracts (the `x-brand` header and the `gym.brand_module_id` column) defer
 * to. Phase 4 flips this to the neutral **base** module (grill (e)): an unknown or
 * absent brand now wears neutral chrome — the thousands of generic gyms' marca —
 * instead of Forge's. Every mapped host is unaffected (host-wins precedence).
 */
export const DEFAULT_BRAND: BrandId = "base";
