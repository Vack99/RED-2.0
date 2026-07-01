/**
 * The brands (marcas) Phase 2 ships. The atomic tenant-presentation key shared by
 * the host-map (resolution input) and the brand-module registry (presentation) —
 * neither owns it, so it lives here alone, free of any React/presentation import.
 * In Phase 3 this keyspace equals the tenant (gym) slug (CONTEXT.md, ADR-0012).
 */
export type BrandId = "forge" | "red";

/**
 * Fallback brand when no host-map hit and no valid `?gym=` override resolves —
 * the lowest-precedence arm of host→brand (ADR-0012 §1). Forge is brand #1.
 */
export const DEFAULT_BRAND: BrandId = "forge";
