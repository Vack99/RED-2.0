import "server-only";

import { cache } from "react";

import { disponibles as disponiblesDe } from "@gym/domain/rules";
import { addDays, hoyEnZona, horaEnZona, instanteEnZona } from "@gym/format";

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

/** The gym identity a marketing page needs: the row id (to scope catalog reads), the brand name (the
 *  eyebrow "Precios · {brandName}"), and the IANA timezone (to resolve the landing's "today" window +
 *  format each session's wall-clock hora). Presentation only — NEVER an authz input. */
export interface MarketingGym {
  id: string;
  brandName: string;
  timezone: string;
}

/** Resolve the marketing gym from its slug (the proxy's x-gym stamp). Returns null for an unknown slug
 *  (no tenant → the page renders its empty/fallback state). Memoized per request. */
export const getMarketingGym = cache(
  async (
    slug: string,
    client: SupabaseServer = createAnonClient(),
  ): Promise<MarketingGym | null> => {
    const { data } = await client
      .from("gym")
      .select("id, brand_name, timezone")
      .eq("slug", slug)
      .maybeSingle();
    return data
      ? { id: data.id, brandName: data.brand_name, timezone: data.timezone }
      : null;
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
  async (
    gymId: string,
    client: SupabaseServer = createAnonClient(),
  ): Promise<PlanPublicoDTO[]> => {
    const [{ data: rows }, { data: feats }] = await Promise.all([
      client
        .from("paquetes")
        .select(
          "id, nombre, precio, popular, orden, name, subtitle, badge, cadence",
        )
        .eq("gym_id", gymId)
        .order("orden"),
      client
        .from("plan_feature")
        .select("plan_id, label, orden")
        .eq("gym_id", gymId)
        .order("orden"),
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
  async (
    gymId: string,
    client: SupabaseServer = createAnonClient(),
  ): Promise<FaqPublicaDTO[]> => {
    const { data } = await client
      .from("faq")
      .select("id, question, answer")
      .eq("gym_id", gymId)
      .order("sort_order");
    return (data ?? []).map((f) => ({
      id: f.id,
      question: f.question,
      answer: f.answer,
    }));
  },
);

/** One row of the landing's today-schedule teaser: the wall-clock hora, the class type name, and the
 *  DERIVED free-spot count (never a stored column — ADR-0010). */
export interface HorarioHoyDTO {
  id: string;
  hora: string;
  tipo: string;
  disponibles: number;
}

/** Today's real class sessions for the landing teaser (the mock's "Hoy en {brand}"): every non-cancelled
 *  `class_session` starting within today's gym-local window, ordered by start, joined to its class_type
 *  name — two plain anon reads assembled in JS (no embedded select), mirroring the Agenda DAL.
 *
 *  Occupancy is DERIVED, not stored (ADR-0010): `disponibles = capacity − active`. The anon surface can
 *  read neither reservations nor a member session (reservations are member-owned; ADR-0009/0010), so the
 *  active count anon can observe is 0 and the public label shows best-case availability = capacity — the
 *  same 0-projection the Agenda reader documents until booking lands, applied to the public teaser.
 *
 *  Gym-scoped (`.eq('gym_id', …)`) because the anon policy is flat across gyms (`using (true)`); `tz` is
 *  the caller's resolved gym zone (getMarketingGym), never a constant. Best-effort: [] on no rows/error.
 *  Memoized per request. */
export const getHorarioHoyPublico = cache(
  async (
    gymId: string,
    tz: string,
    client: SupabaseServer = createAnonClient(),
  ): Promise<HorarioHoyDTO[]> => {
    const hoy = hoyEnZona(tz);
    const low = instanteEnZona(hoy, "00:00", tz);
    const high = instanteEnZona(addDays(hoy, 1), "00:00", tz);

    const { data: sesiones } = await client
      .from("class_session")
      .select("id, class_type_id, starts_at, capacity")
      .eq("gym_id", gymId)
      .is("cancelled_at", null)
      .gte("starts_at", low.toISOString())
      .lt("starts_at", high.toISOString())
      .order("starts_at");

    const rows = sesiones ?? [];
    if (rows.length === 0) return [];

    const tipoIds = [...new Set(rows.map((r) => r.class_type_id))];
    const { data: tipos } = await client
      .from("class_type")
      .select("id, name")
      .in("id", tipoIds);
    const tipoById = new Map((tipos ?? []).map((t) => [t.id, t.name]));

    return rows.map((r) => ({
      id: r.id,
      hora: horaEnZona(new Date(r.starts_at), tz),
      tipo: tipoById.get(r.class_type_id) ?? "—",
      disponibles: disponiblesDe(r.capacity, 0),
    }));
  },
);
