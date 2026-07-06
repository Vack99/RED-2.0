import "server-only";

import { cache } from "react";

import { createAnonClient, type SupabaseServer } from "./supabase";

/**
 * The public marketing readers — the client app's anonymous surface over the decision-(b) anon-SELECT
 * catalog (20260706160000_phase6_anon_catalog_read). They read as the `anon` role through a cookieless
 * client (never a member session) and SCOPE every read to one gym by id, because the anon policies are
 * flat across gyms by design (`using (true)`; hostnames are public, the page picks its gym). The gym is
 * resolved from the proxy-stamped host (x-gym slug), never trusted as an authz claim (ADR-0012).
 *
 * Every reader takes an injectable client (ADR-0001) defaulting to the anon client, so the row→DTO
 * mapping is unit-testable with a fake and the pages share one instance per request via cache().
 */

/** The gym identity a marketing page needs: the row id (to scope catalog reads) + the brand name (the
 *  eyebrow "Precios · {brandName}"). Presentation only — NEVER an authz input. */
export interface MarketingGym {
  id: string;
  brandName: string;
}

/** Resolve the marketing gym from its slug (the proxy's x-gym stamp). Returns null for an unknown slug
 *  (no tenant → the page renders its empty/fallback state). Memoized per request. */
export const getMarketingGym = cache(
  async (slug: string, client: SupabaseServer = createAnonClient()): Promise<MarketingGym | null> => {
    const { data } = await client
      .from("gym")
      .select("id, brand_name")
      .eq("slug", slug)
      .maybeSingle();
    return data ? { id: data.id, brandName: data.brand_name } : null;
  },
);

/** One plan as the public Precios page renders it: marketing display copy + its ordered feature list.
 *  `name` falls back to the grant-derived `nombre` when the operator has not set a marketing name. */
export interface PlanPublicoDTO {
  id: string;
  name: string;
  subtitle: string | null;
  precio: number;
  cadence: string | null;
  badge: string | null;
  popular: boolean;
  features: string[];
}

/** A gym's public plan catalog in display order: paquetes (marketing surface) enriched with each plan's
 *  ordered feature list (one extra query, grouped in memory — no N+1). Anon + gym-scoped. Best-effort:
 *  returns [] when the read fails (error is not destructured). Memoized per request. */
export const getPlanesPublicos = cache(
  async (gymId: string, client: SupabaseServer = createAnonClient()): Promise<PlanPublicoDTO[]> => {
    const [{ data: rows }, { data: feats }] = await Promise.all([
      client
        .from("paquetes")
        .select("id, nombre, precio, popular, orden, name, subtitle, badge, cadence")
        .eq("gym_id", gymId)
        .order("orden"),
      client.from("plan_feature").select("plan_id, label, orden").eq("gym_id", gymId).order("orden"),
    ]);

    if (!rows) return [];

    const byPlan = new Map<string, string[]>();
    for (const f of feats ?? []) {
      const list = byPlan.get(f.plan_id) ?? [];
      list.push(f.label);
      byPlan.set(f.plan_id, list);
    }

    return rows.map((p) => ({
      id: p.id,
      name: p.name ?? p.nombre,
      subtitle: p.subtitle,
      precio: p.precio,
      cadence: p.cadence,
      badge: p.badge,
      popular: p.popular,
      features: byPlan.get(p.id) ?? [],
    }));
  },
);

/** One pregunta/respuesta pair for the public FAQ accordion. */
export interface FaqPublicaDTO {
  id: string;
  question: string;
  answer: string;
}

/** A gym's FAQs in display order, anon + gym-scoped. Best-effort: returns [] on error. Memoized. */
export const getFaqsPublicas = cache(
  async (gymId: string, client: SupabaseServer = createAnonClient()): Promise<FaqPublicaDTO[]> => {
    const { data } = await client
      .from("faq")
      .select("id, question, answer")
      .eq("gym_id", gymId)
      .order("sort_order");
    return (data ?? []).map((f) => ({ id: f.id, question: f.question, answer: f.answer }));
  },
);

/** One "quiénes somos" value card (about_value) as the Nosotros page renders it. */
export interface ValorPublicoDTO {
  id: string;
  title: string;
  description: string;
}

/** A gym's values in the operator's display order, anon + gym-scoped. Best-effort []. Memoized. */
export const getValoresPublicos = cache(
  async (gymId: string, client: SupabaseServer = createAnonClient()): Promise<ValorPublicoDTO[]> => {
    const { data } = await client
      .from("about_value")
      .select("id, title, description")
      .eq("gym_id", gymId)
      .order("sort_order");
    return (data ?? []).map((v) => ({ id: v.id, title: v.title, description: v.description }));
  },
);

/** One instalación card (facility) — name + one-line description. */
export interface InstalacionPublicaDTO {
  id: string;
  name: string;
  description: string;
}

/** A gym's facilities in display order, anon + gym-scoped. Best-effort []. Memoized. */
export const getInstalacionesPublicas = cache(
  async (
    gymId: string,
    client: SupabaseServer = createAnonClient(),
  ): Promise<InstalacionPublicaDTO[]> => {
    const { data } = await client
      .from("facility")
      .select("id, name, description")
      .eq("gym_id", gymId)
      .order("sort_order");
    return (data ?? []).map((f) => ({ id: f.id, name: f.name, description: f.description }));
  },
);

/** One marketing stat tile — a label + free-text value ("Coaches" / "3", "Taller" / "320 m²"). */
export interface StatPublicaDTO {
  id: string;
  label: string;
  value: string;
}

/** A gym's stat tiles in display order, anon + gym-scoped. Best-effort []. Memoized. */
export const getStatsPublicas = cache(
  async (gymId: string, client: SupabaseServer = createAnonClient()): Promise<StatPublicaDTO[]> => {
    const { data } = await client
      .from("stat")
      .select("id, label, value")
      .eq("gym_id", gymId)
      .order("sort_order");
    return (data ?? []).map((s) => ({ id: s.id, label: s.label, value: s.value }));
  },
);

/** One coach as the public roster renders it (specialty/bio are operator-optional → nullable). */
export interface CoachPublicoDTO {
  id: string;
  name: string;
  initials: string;
  role: string;
  specialty: string | null;
  bio: string | null;
}

/** A gym's ACTIVE coach roster in display order, anon + gym-scoped. The anon `using(true)` policy would
 *  expose deactivated coaches too, so the active filter is a QUERY concern here. Best-effort []. Memoized. */
export const getCoachesPublicos = cache(
  async (gymId: string, client: SupabaseServer = createAnonClient()): Promise<CoachPublicoDTO[]> => {
    const { data } = await client
      .from("coach")
      .select("id, name, initials, role, specialty, bio")
      .eq("gym_id", gymId)
      .eq("is_active", true)
      .order("sort_order");
    return (data ?? []).map((c) => ({
      id: c.id,
      name: c.name,
      initials: c.initials,
      role: c.role,
      specialty: c.specialty ?? null,
      bio: c.bio ?? null,
    }));
  },
);

/** One class format (tipo de clase) as the Nosotros "cómo entrenamos" section renders it. level,
 *  description, and duration are operator-optional → nullable; the page composes a subtitle from them. */
export interface FormatoPublicoDTO {
  id: string;
  name: string;
  level: string | null;
  description: string | null;
  durationMin: number | null;
}

/** A gym's class formats, anon + gym-scoped, ordered by name (class_type carries no sort_order).
 *  Best-effort []. Memoized. */
export const getFormatosPublicos = cache(
  async (
    gymId: string,
    client: SupabaseServer = createAnonClient(),
  ): Promise<FormatoPublicoDTO[]> => {
    const { data } = await client
      .from("class_type")
      .select("id, name, level, description, default_duration_min")
      .eq("gym_id", gymId)
      .order("name");
    return (data ?? []).map((t) => ({
      id: t.id,
      name: t.name,
      level: t.level ?? null,
      description: t.description ?? null,
      durationMin: t.default_duration_min ?? null,
    }));
  },
);
