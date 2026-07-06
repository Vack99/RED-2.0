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
  /** Grant-derived label ("8 clases" / "Ilimitado") — the plan's stable per-gym identity (unique). The
   *  member membresía surface marks its current plan by matching this against clientes.paquete_nombre. */
  nombre: string;
  name: string;
  subtitle: string | null;
  precio: number;
  cadence: string | null;
  badge: string | null;
  popular: boolean;
  features: string[];
}

/** A gym's public plan catalog in display order: paquetes (marketing surface) enriched with each plan's
 *  ordered feature list (one extra query, grouped in memory — no N+1). Anon + gym-scoped. Also readable
 *  with an injected MEMBER session (the perfil's "Cambiar plan" list, slice #61) — the member policies
 *  (paquetes_/plan_feature_member_select) scope the same query to their own gym. Best-effort:
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
      nombre: p.nombre,
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

/** One weekday's opening hours as the Contacto page renders them. `closed` days carry null open/close
 *  times (the row shows "Cerrado"); open days carry the "HH:MM" strings the operator stored. */
export interface HorarioDTO {
  day: string;
  opens: string | null;
  closes: string | null;
  closed: boolean;
}

/** A gym's public contact details (address + map pin + direct channels + weekly hours) as the Contacto
 *  page consumes them. Every field is nullable — a gym with partial contact info renders empty states.
 *  `latitude`/`longitude` feed the coords label and the derived open-in-maps URL (never a stored URL). */
export interface ContactoDTO {
  addressLine: string | null;
  addressNote: string | null;
  latitude: number | null;
  longitude: number | null;
  whatsapp: string | null;
  email: string | null;
  instagram: string | null;
  horarios: HorarioDTO[];
}

/** Map the stored `hours` jsonb (an array of `{day, opens, closes}` or `{day, closed:true}`) into the
 *  ordered HorarioDTO list the page renders. Defensive: a non-array or a malformed entry is skipped, so
 *  bad operator data degrades to a shorter table rather than a crash. */
export function parseHorarios(raw: unknown): HorarioDTO[] {
  if (!Array.isArray(raw)) return [];
  const out: HorarioDTO[] = [];
  for (const entry of raw) {
    if (typeof entry !== "object" || entry === null) continue;
    const e = entry as Record<string, unknown>;
    if (typeof e.day !== "string") continue;
    const closed = e.closed === true;
    out.push({
      day: e.day,
      opens: !closed && typeof e.opens === "string" ? e.opens : null,
      closes: !closed && typeof e.closes === "string" ? e.closes : null,
      closed,
    });
  }
  return out;
}

/** A gym's public contact details, anon + gym-scoped. Returns null when no gym_contact row exists (the
 *  page renders its "contacto próximamente" state). Best-effort. Memoized per request. Postgres `numeric`
 *  serializes as a string over PostgREST, so lat/long are coerced to numbers here. */
export const getContacto = cache(
  async (gymId: string, client: SupabaseServer = createAnonClient()): Promise<ContactoDTO | null> => {
    const { data } = await client
      .from("gym_contact")
      .select("address_line, address_note, latitude, longitude, whatsapp, email, instagram, hours")
      .eq("gym_id", gymId)
      .maybeSingle();
    if (!data) return null;
    return {
      addressLine: data.address_line,
      addressNote: data.address_note,
      latitude: data.latitude == null ? null : Number(data.latitude),
      longitude: data.longitude == null ? null : Number(data.longitude),
      whatsapp: data.whatsapp,
      email: data.email,
      instagram: data.instagram,
      horarios: parseHorarios(data.hours),
    };
  },
);

/** The contact-form intake payload. `gymSlug` is the public host slug (the RPC resolves it to the gym
 *  server-side — ADR-0012, never a client-supplied gym id); `ip` (nullable) feeds the RPC's per-IP limit. */
export interface EnviarMensajeInput {
  gymSlug: string;
  nombre: string;
  correo: string;
  mensaje: string;
  ip: string | null;
}

/** Submit a contact-form lead through the guarded intake RPC — the ONE anon WRITE on the public surface.
 *  The RPC (SECURITY DEFINER) validates, enforces the per-IP rate limit, and inserts; a raised limit or a
 *  validation failure surfaces as a thrown error the caller maps to a friendly message. Anon client. */
export async function enviarMensajeContacto(
  input: EnviarMensajeInput,
  client: SupabaseServer = createAnonClient(),
): Promise<void> {
  const { error } = await client.rpc("enviar_mensaje_contacto", {
    p_gym_slug: input.gymSlug,
    p_nombre: input.nombre,
    p_correo: input.correo,
    p_mensaje: input.mensaje,
    p_ip: input.ip ?? undefined,
  });
  if (error) throw new Error(error.message);
}

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
