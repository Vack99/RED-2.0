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
 * Host resolution result. `matched` records whether a `gym_domain` row existed for
 * the host — the precedence hinge: a matched host WINS even when its `gym` row is
 * absent (`tenant: null`), so a mapped host never falls through to the `?gym=`
 * override. `matched: false` is the "no `gym_domain` row" case that DOES fall
 * through. Preserving this flag keeps resolution bit-identical to the pre-cache code.
 */
interface HostResolution {
  matched: boolean;
  tenant: Tenant | null;
}

/**
 * Module-level in-process TTL cache for the GLOBAL host/slug→tenant mappings. This
 * data is per-host/per-slug PUBLIC mapping (ADR-0012 §5), never user-scoped, so a
 * process-wide cache is correct (unlike session/user data). Positive AND negative
 * results are cached under the same 60s TTL: a host that is later mapped starts
 * working within ~60s, and the unmapped-host case (local/dev + any misdirected
 * request) is spared a DB round trip on every navigation. Bounded FIFO (Map insertion
 * order) at 500 entries. Plain JS (Map + Date.now) — Edge-runtime safe, no deps.
 */
const CACHE_TTL_MS = 60_000;
const CACHE_MAX_ENTRIES = 500;

interface CacheEntry<T> {
  value: T;
  expires: number;
}

class TtlCache<T> {
  private readonly map = new Map<string, CacheEntry<T>>();

  /** A miss returns `undefined`; a hit returns `{ value }` so a cached `null`/`false`
   *  result is still a hit (negative caching), never confused with an absent entry. */
  get(key: string): { value: T } | undefined {
    const entry = this.map.get(key);
    if (!entry) return undefined;
    if (entry.expires <= Date.now()) {
      this.map.delete(key);
      return undefined;
    }
    return { value: entry.value };
  }

  set(key: string, value: T): void {
    if (!this.map.has(key) && this.map.size >= CACHE_MAX_ENTRIES) {
      const oldest = this.map.keys().next().value;
      if (oldest !== undefined) this.map.delete(oldest);
    }
    this.map.set(key, { value, expires: Date.now() + CACHE_TTL_MS });
  }

  clear(): void {
    this.map.clear();
  }
}

const hostCache = new TtlCache<HostResolution>();
const slugCache = new TtlCache<Tenant | null>();

/** Drop all cached host/slug resolutions. Exported for tests (cache-hit, TTL, and
 *  eviction assertions need a clean cache between cases); harmless in production. */
export function clearTenantCache(): void {
  hostCache.clear();
  slugCache.clear();
}

/** Host arm, uncached: `gym_domain` row → load its `gym`. `matched` mirrors whether
 *  the domain row existed, so the host-wins short-circuit survives caching. */
async function resolveHostUncached(
  client: SupabaseServer,
  hostname: string,
): Promise<HostResolution> {
  const { data: domain } = await client
    .from("gym_domain")
    .select("gym_id")
    .eq("hostname", hostname)
    .maybeSingle();
  if (!domain) return { matched: false, tenant: null };
  return { matched: true, tenant: await gymTenant(client, "id", domain.gym_id) };
}

async function cachedHost(client: SupabaseServer, hostname: string): Promise<HostResolution> {
  const cached = hostCache.get(hostname);
  if (cached) return cached.value;
  const resolved = await resolveHostUncached(client, hostname);
  hostCache.set(hostname, resolved);
  return resolved;
}

async function cachedSlug(client: SupabaseServer, slug: string): Promise<Tenant | null> {
  const cached = slugCache.get(slug);
  if (cached) return cached.value;
  const resolved = await gymTenant(client, "slug", slug);
  slugCache.set(slug, resolved);
  return resolved;
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
 * Host wins, so on a mapped customer domain the override is structurally inert. Both
 * arms read a 60s in-process TTL cache (`hostCache`/`slugCache`) and, on a miss, fire
 * in PARALLEL — the host lookup and (only when a `?gym=` override is present) the slug
 * lookup — before the precedence rule above picks the winner. Resolution is
 * bit-identical to the pre-cache code; the cache only avoids repeat round trips.
 * Server-only, async. `client` is injectable for tests (ADR-0001).
 */
export async function resolveTenant(
  host: string | null,
  override: string | null,
  client: SupabaseServer = anonClient(),
): Promise<Tenant | null> {
  const hostname = host?.split(":")[0].toLowerCase() ?? "";

  const [hostResolution, overrideTenant] = await Promise.all([
    cachedHost(client, hostname),
    override ? cachedSlug(client, override) : Promise.resolve(null),
  ]);

  if (hostResolution.matched) return hostResolution.tenant;
  if (override) return overrideTenant;
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
