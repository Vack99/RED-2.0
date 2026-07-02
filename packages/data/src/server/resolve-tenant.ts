import "server-only";

import { createClient as createSupabaseClient } from "@supabase/supabase-js";

import type { Database } from "../database.types";
import type { SupabaseServer } from "./supabase";

/**
 * The resolved inquilino (tenant): the `gym` row's identity + its brand-module key.
 * `slug` is the presentation/UX tenant id the proxy stamps as `x-gym` — NEVER an
 * authz input (isolation is RLS-by-membership; ADR-0008 hinge). `brandModuleId` is
 * the opaque registry key stamped as `x-brand`, which the layout validates against
 * the registry with a `DEFAULT_BRAND` fallback (ADR-0012 §5).
 */
export interface Tenant {
  id: string;
  slug: string;
  brandModuleId: string;
}

/**
 * Anon client for the pre-auth host→gym lookup: it reads only the anon-select
 * `gym`/`gym_domain` rows (ADR-0013 §3), so it needs no cookies/session and runs
 * in the proxy's pre-render context. The URL/anon key are identical for every
 * tenant (ADR-0008), so there is no per-gym secret here.
 */
function anonClient(): SupabaseServer {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}

/**
 * DB-backed host→gym resolution both proxies run (ADR-0012 §5, amended 2026-07-02) —
 * the swap that retires the static in-code host→brand map. Host-wins precedence:
 *
 *   1. a `gym_domain` row for the (port-stripped, lower-cased) host;
 *   2. a `?gym=` override naming a REAL gym slug (open set, validated against the DB);
 *   3. NO tenant (`null`) — chrome falls back to `DEFAULT_BRAND` and tenant-requiring
 *      writes refuse rather than silently defaulting.
 *
 * Host wins, so on a mapped customer domain the override is structurally inert.
 * Server-only, async, no cache (v1). `client` is injectable for tests (ADR-0001).
 */
export async function resolveTenant(
  host: string | null,
  override: string | null,
  client: SupabaseServer = anonClient(),
): Promise<Tenant | null> {
  const hostname = host?.split(":")[0].toLowerCase() ?? "";

  const { data: domain } = await client
    .from("gym_domain")
    .select("gym_id")
    .eq("hostname", hostname)
    .maybeSingle();
  if (domain) return gymTenant(client, "id", domain.gym_id);

  if (override) return gymTenant(client, "slug", override);

  return null;
}

/** Load a gym row by a unique column (host arm → `id`, override arm → `slug`) and
 *  shape it into the `Tenant`; a miss (unknown slug) resolves to `null`. */
async function gymTenant(
  client: SupabaseServer,
  column: "id" | "slug",
  value: string,
): Promise<Tenant | null> {
  const { data } = await client
    .from("gym")
    .select("id, slug, brand_module_id")
    .eq(column, value)
    .maybeSingle();
  return data ? { id: data.id, slug: data.slug, brandModuleId: data.brand_module_id } : null;
}

/**
 * Stamp the resolved tenant onto a forwarded-request header set — the proxy seam
 * both apps run. A resolved tenant stamps `x-gym` (slug) + `x-brand` (module key);
 * NO tenant stamps neither, so the layout falls back to `DEFAULT_BRAND` and the
 * request carries no `x-gym` claim (unknown host → no tenant). Returns a fresh
 * `Headers` (never mutates the caller's).
 */
export function tenantHeaders(base: Headers, tenant: Tenant | null): Headers {
  const headers = new Headers(base);
  if (tenant) {
    headers.set("x-gym", tenant.slug);
    headers.set("x-brand", tenant.brandModuleId);
  }
  return headers;
}
