import type { BrandId } from "./brand-id";

/**
 * Static host → brand registry — a labelled Phase-3 stub for the future `gym`-row
 * lookup (ADR-0012 §5). Keys are the production hostnames that will become the
 * `gym.hostname` column; the `*.localhost` entries let dev hit the real host arm
 * with zero DNS. Resolution precedence (host-wins) is S1's `resolveBrandId`; this
 * package only owns the data. Production hostnames are added when the domains are
 * provisioned (the Vercel HITL slice) — until then dev runs entirely on `*.localhost`.
 */
export const HOST_TO_BRAND: Record<string, BrandId> = {
  "forge.localhost": "forge",
  "red.localhost": "red",
};
