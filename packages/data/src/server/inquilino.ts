import "server-only";

import { headers } from "next/headers";
import { cache } from "react";

import type { SupabaseServer } from "./supabase";

/**
 * El inquilino EN EFECTO — the request-scoped half of the tenant seam. `resolve-tenant.ts`
 * is the proxy-side half (host → `gym_domain` → `gym`, stamped as `x-gym`); this module is
 * what the request reads back out of that stamp, plus the one reconciliation of it against
 * the caller's own memberships.
 *
 * It is deliberately NOT a parameter. The slug used to be threaded as an optional
 * `hostGymSlug` through eight signatures, so a caller that forgot it silently read another
 * gym — the `mi_membresia` roulette bug class (#74/#219). There is nothing left to forget:
 * the resolver reads the request itself, memoized per request via React `cache()`.
 */

/**
 * The tenant the HOST names (`x-gym`, stamped by `proxy.ts`), or `null` when no
 * `gym_domain` row matched — the bare `.vercel.app`, every preview, plain `pnpm dev`.
 * Presentation-only (ADR-0008): it can only PICK among rows the caller already holds,
 * never widen what RLS lets them read.
 *
 * The `catch` is required, not defensive padding: the DAL unit tests never enter a request
 * scope, where `headers()` throws. Outside a request React's `cache()` passes straight
 * through, so the fallback still runs.
 */
export const slugDelHost = cache(async function slugDelHost(): Promise<string | null> {
  try {
    return (await headers()).get("x-gym");
  } catch {
    return null;
  }
});

/** The gym a signed-in member reads in: id + gym-local timezone + brand display name. */
export interface GymDelMiembro {
  id: string;
  tz: string;
  /** `gym.brand_name` — the brand-neutral display name the perfil footer renders. */
  marca: string;
}

/**
 * The MEMBER's gym, from their own `gym_membership` self-read — the RLS gate (ADR-0013 §4).
 * Returns `null` for an anon/non-member caller (or an unreadable gym row) INSTEAD of
 * throwing: the signed-in-but-not-yet-a-member state (audit #10/#15 — a swallowed claim or
 * a password-reset-first session) must not crash the booking home.
 *
 * Host reconciliation (audit #17 / spec §5.5): a member who belongs to several gyms sees the
 * HOST gym's data on that gym's site — this prefers the membership whose gym matches
 * `slugDelHost()`, falling back to the OLDEST membership (stable and deterministic — never
 * the `limit(1)` roulette). It picks only among the caller's OWN memberships; RLS still
 * scopes every downstream read, so the host can never surface data the caller doesn't hold.
 *
 * `cache()`-wrapped (perf): a page's branches (agenda / saldo / perfil / clase detail) each
 * resolve the SAME member's gym in the SAME request. React `cache()` keys on argument
 * identity, and `createClient()` (supabase.ts) is itself `cache()`-wrapped, so every caller
 * in one request that passes `client: undefined` holds the SAME instance — one bucket, one
 * round trip. Per-request memoization, never module-level state.
 *
 * The staff seam is NOT this function and must not be folded into it: `getOperatorGym`
 * (gym.ts) filters to `owner|operator` and falls back by `gym_id` precisely so a socio's
 * `member` row can never win the admin app (audit #19).
 */
export const resolverMiembroGym = cache(async function resolverMiembroGym(
  supabase: SupabaseServer,
): Promise<GymDelMiembro | null> {
  // ONE request (embedded FK join) instead of a membership-then-gym pair (perf):
  // gym_membership.gym_id → gym is a many-to-one FK, so PostgREST embeds `gym` as a
  // single object per row (verified against the local stack), never an array.
  const { data: memberships } = await supabase
    .from("gym_membership")
    .select("gym_id, created_at, gym(id, slug, timezone, brand_name)")
    .order("created_at", { ascending: true });
  if (!memberships || memberships.length === 0) return null;

  const host = await slugDelHost();
  const enHost = host ? memberships.find((m) => m.gym?.slug === host) : undefined;
  const elegido = enHost ?? memberships[0]; // host match, else the oldest (stable fallback)
  const gym = elegido.gym;
  if (!gym?.timezone) return null;

  return { id: elegido.gym_id, tz: gym.timezone, marca: gym.brand_name };
});
