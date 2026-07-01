import type { BrandId } from "./brand-id";

/**
 * Static host → brand registry — a labelled Phase-3 stub for the future `gym`-row
 * lookup (ADR-0012 §5). Keys are the production hostnames that will become
 * `gym_domain(gym_id, hostname, app)` rows; the `*.localhost` entries let dev hit the real host arm
 * with zero DNS. Resolution precedence (host-wins) is S1's `resolveBrandId`; this
 * package only owns the data. The production hostnames below were provisioned in the
 * Vercel HITL slice (#16).
 */
export const HOST_TO_BRAND: Record<string, BrandId> = {
  "forge.localhost": "forge",
  "red.localhost": "red",
  // Production (Vercel-assigned, #16). The client deployment serves BOTH brands by
  // host — the multi-tenant proof — while admin stays Forge-only (RED-admin is Phase 4).
  "red-2-0-admin.vercel.app": "forge",
  "red-2-0-client.vercel.app": "red",
  "forge-red-2-0-client.vercel.app": "forge",
};
