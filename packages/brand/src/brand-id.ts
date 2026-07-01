/**
 * The brands (marcas) Phase 2 ships. The atomic tenant-presentation key shared by
 * the host-map (resolution input) and the brand-module registry (presentation) —
 * neither owns it, so it lives here alone, free of any React/presentation import.
 * Phase 3 SPLITS the keyspaces: tenant (gym) slugs become an open DB-backed set, and
 * many gyms map onto one of these enumerable module keys (ADR-0012 Consequences) —
 * the slug↔BrandId equality holds in Phase 2 only.
 */
export type BrandId = "forge" | "red";

/**
 * Fallback brand when no host-map hit and no valid `?gym=` override resolves —
 * the lowest-precedence arm of host→brand (ADR-0012 §1). Forge is brand #1.
 */
export const DEFAULT_BRAND: BrandId = "forge";
