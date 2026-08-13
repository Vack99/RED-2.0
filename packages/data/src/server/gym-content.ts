import "server-only";

import { cache } from "react";
import { z } from "zod";

import { createAnonClient, createClient, type SupabaseServer } from "./supabase";

import { requireOperator } from "./_auth";
import { getOperatorGym } from "./gym";

/**
 * "Contenido del gimnasio" (Fase 5, PRD #36 S3) — the curated marketing catalog an operator authors
 * under `cuenta` (about_value / facility / faq / stat, one section each, CONTEXT.md's "Contenido del
 * gimnasio" table) and the client app's public pages (nosotros/precios) read anon. Each table is
 * `gym_id`-scoped with a `sort_order` the operator controls; RLS is staff-writes/member-reads/anon-reads
 * (ADR-0013 §3). One home for both audiences: the AUTHED reader (`list*`) relies on RLS to scope to the
 * caller's own gym (no explicit filter, injectable client, ADR-0001); the ANON reader (`get*Publicas`)
 * has no session to scope by, so it takes the gym id and filters explicitly (`createAnonClient`, mirroring
 * `marketing.ts`'s other public readers — ADR-0012 never trusts the host as an authz claim). The two read
 * the same columns in the same order, so each pair shares one row→DTO mapper; the public DTO names are
 * type aliases of the operator DTO, not re-declared shapes.
 */

// ── about_value ("valor") ──────────────────────────────────────────────────

/** One "quiénes somos" value card (e.g. "Comunidad" / "Entrenamos juntos, no solos."), operator-authored. */
export interface AboutValueDTO {
  id: string;
  title: string;
  description: string;
}

/** The public-facing name for the same row shape (Nosotros page). */
export type ValorPublicoDTO = AboutValueDTO;

function toAboutValueDTO(row: { id: string; title: string; description: string }): AboutValueDTO {
  return { id: row.id, title: row.title, description: row.description };
}

/** The gym's values, in display order. RLS scopes rows to the caller's gym (is_member_of). Memoized per request.
 *  @returns the value list · best-effort: returns [] on error (error is not destructured). */
export const listAboutValues = cache(async (client?: SupabaseServer): Promise<AboutValueDTO[]> => {
  const supabase = client ?? (await createClient());
  const { data } = await supabase
    .from("about_value")
    .select("id, title, description")
    .order("sort_order");
  return (data ?? []).map(toAboutValueDTO);
});

/** A gym's values in the operator's display order, anon + gym-scoped. Best-effort []. Memoized. */
export const getValoresPublicos = cache(
  async (gymId: string, client: SupabaseServer = createAnonClient(gymId)): Promise<ValorPublicoDTO[]> => {
    const { data } = await client
      .from("about_value")
      .select("id, title, description")
      .eq("gym_id", gymId)
      .order("sort_order");
    return (data ?? []).map(toAboutValueDTO);
  },
);

const tituloSchema = z.string().trim().min(1).max(60);
const descripcionValorSchema = z.string().trim().min(1).max(400);

export const crearAboutValueSchema = z.object({ title: tituloSchema, description: descripcionValorSchema });
export const actualizarAboutValueSchema = z.object({
  id: z.string().uuid(),
  title: tituloSchema,
  description: descripcionValorSchema,
});
export const eliminarAboutValueSchema = z.object({ id: z.string().uuid() });
export const reordenarAboutValuesSchema = z.object({ ids: z.array(z.string().uuid()).min(1) });

/** Create a value card, appended after the operator's current last (no atomicity concern beyond a
 *  single row — the display order self-heals on the next reorder). Injectable (ADR-0001). */
export async function crearAboutValue(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = crearAboutValueSchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const gym = await getOperatorGym(supabase);

  const { data: last } = await supabase
    .from("about_value")
    .select("sort_order")
    .eq("gym_id", gym.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (last?.sort_order ?? -1) + 1;

  const { error } = await supabase
    .from("about_value")
    .insert({ gym_id: gym.id, title: input.title, description: input.description, sort_order: nextOrder });
  if (error) throw new Error("No se pudo crear el valor");
}

/** Edit an existing value card (staff-scoped via RLS). Injectable (ADR-0001). */
export async function actualizarAboutValue(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = actualizarAboutValueSchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const { data, error } = await supabase
    .from("about_value")
    .update({ title: input.title, description: input.description })
    .eq("id", input.id)
    .select("id");
  if (error) throw new Error("No se pudo actualizar el valor");
  if (!data || data.length === 0) throw new Error("Valor no encontrado");
}

/** Delete a value card (staff-scoped via RLS). Injectable (ADR-0001). */
export async function eliminarAboutValue(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = eliminarAboutValueSchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const { data, error } = await supabase.from("about_value").delete().eq("id", input.id).select("id");
  if (error) throw new Error("No se pudo eliminar el valor");
  if (!data || data.length === 0) throw new Error("Valor no encontrado");
}

/** Persist a new display order: `ids` is the FULL list in its new order; each row's `sort_order`
 *  becomes its index. RLS scopes every update to the caller's own gym (a foreign id silently no-ops).
 *  Injectable (ADR-0001). */
export async function reordenarAboutValues(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = reordenarAboutValuesSchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const results = await Promise.all(
    input.ids.map((id, index) => supabase.from("about_value").update({ sort_order: index }).eq("id", id)),
  );
  if (results.some((r) => r.error)) throw new Error("No se pudo reordenar los valores");
}

// ── facility ("instalación") ───────────────────────────────────────────────

/** One instalación card (e.g. "Área de pesas" / "Equipo completo de pesas libres."), operator-authored. */
export interface FacilityDTO {
  id: string;
  name: string;
  description: string;
}

/** The public-facing name for the same row shape (Nosotros page). */
export type InstalacionPublicaDTO = FacilityDTO;

function toFacilityDTO(row: { id: string; name: string; description: string }): FacilityDTO {
  return { id: row.id, name: row.name, description: row.description };
}

/** The gym's facilities, in display order. RLS scopes rows to the caller's gym (is_member_of). Memoized per request.
 *  @returns the facility list · best-effort: returns [] on error (error is not destructured). */
export const listFacilities = cache(async (client?: SupabaseServer): Promise<FacilityDTO[]> => {
  const supabase = client ?? (await createClient());
  const { data } = await supabase
    .from("facility")
    .select("id, name, description")
    .order("sort_order");
  return (data ?? []).map(toFacilityDTO);
});

/** A gym's facilities in display order, anon + gym-scoped. Best-effort []. Memoized. */
export const getInstalacionesPublicas = cache(
  async (
    gymId: string,
    client: SupabaseServer = createAnonClient(gymId),
  ): Promise<InstalacionPublicaDTO[]> => {
    const { data } = await client
      .from("facility")
      .select("id, name, description")
      .eq("gym_id", gymId)
      .order("sort_order");
    return (data ?? []).map(toFacilityDTO);
  },
);

const nombreFacilitySchema = z.string().trim().min(1).max(60);
const descripcionFacilitySchema = z.string().trim().min(1).max(400);

export const crearFacilitySchema = z.object({ name: nombreFacilitySchema, description: descripcionFacilitySchema });
export const actualizarFacilitySchema = z.object({
  id: z.string().uuid(),
  name: nombreFacilitySchema,
  description: descripcionFacilitySchema,
});
export const eliminarFacilitySchema = z.object({ id: z.string().uuid() });
export const reordenarFacilitiesSchema = z.object({ ids: z.array(z.string().uuid()).min(1) });

/** Create a facility card, appended after the operator's current last (no atomicity concern beyond a
 *  single row — the display order self-heals on the next reorder). Injectable (ADR-0001). */
export async function crearFacility(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = crearFacilitySchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const gym = await getOperatorGym(supabase);

  const { data: last } = await supabase
    .from("facility")
    .select("sort_order")
    .eq("gym_id", gym.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (last?.sort_order ?? -1) + 1;

  const { error } = await supabase
    .from("facility")
    .insert({ gym_id: gym.id, name: input.name, description: input.description, sort_order: nextOrder });
  if (error) throw new Error("No se pudo crear la instalación");
}

/** Edit an existing facility card (staff-scoped via RLS). Injectable (ADR-0001). */
export async function actualizarFacility(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = actualizarFacilitySchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const { data, error } = await supabase
    .from("facility")
    .update({ name: input.name, description: input.description })
    .eq("id", input.id)
    .select("id");
  if (error) throw new Error("No se pudo actualizar la instalación");
  if (!data || data.length === 0) throw new Error("Instalación no encontrada");
}

/** Delete a facility card (staff-scoped via RLS). Injectable (ADR-0001). */
export async function eliminarFacility(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = eliminarFacilitySchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const { data, error } = await supabase.from("facility").delete().eq("id", input.id).select("id");
  if (error) throw new Error("No se pudo eliminar la instalación");
  if (!data || data.length === 0) throw new Error("Instalación no encontrada");
}

/** Persist a new display order: `ids` is the FULL list in its new order; each row's `sort_order`
 *  becomes its index. RLS scopes every update to the caller's own gym (a foreign id silently no-ops).
 *  Injectable (ADR-0001). */
export async function reordenarFacilities(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = reordenarFacilitiesSchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const results = await Promise.all(
    input.ids.map((id, index) => supabase.from("facility").update({ sort_order: index }).eq("id", id)),
  );
  if (results.some((r) => r.error)) throw new Error("No se pudo reordenar las instalaciones");
}

// ── faq ─────────────────────────────────────────────────────────────────────

/** One pregunta/respuesta pair, operator-authored. */
export interface FaqDTO {
  id: string;
  question: string;
  answer: string;
}

/** The public-facing name for the same row shape (Precios FAQ accordion). */
export type FaqPublicaDTO = FaqDTO;

function toFaqDTO(row: { id: string; question: string; answer: string }): FaqDTO {
  return { id: row.id, question: row.question, answer: row.answer };
}

/** The gym's FAQs, in display order. RLS scopes rows to the caller's gym (is_member_of). Memoized per request.
 *  @returns the FAQ list · best-effort: returns [] on error (error is not destructured). */
export const listFaqs = cache(async (client?: SupabaseServer): Promise<FaqDTO[]> => {
  const supabase = client ?? (await createClient());
  const { data } = await supabase.from("faq").select("id, question, answer").order("sort_order");
  return (data ?? []).map(toFaqDTO);
});

/** A gym's FAQs in display order, anon + gym-scoped. Best-effort: returns [] on error. Memoized. */
export const getFaqsPublicas = cache(
  async (gymId: string, client: SupabaseServer = createAnonClient(gymId)): Promise<FaqPublicaDTO[]> => {
    const { data } = await client
      .from("faq")
      .select("id, question, answer")
      .eq("gym_id", gymId)
      .order("sort_order");
    return (data ?? []).map(toFaqDTO);
  },
);

const questionSchema = z.string().trim().min(1).max(200);
const answerSchema = z.string().trim().min(1).max(1000);

export const crearFaqSchema = z.object({ question: questionSchema, answer: answerSchema });
export const actualizarFaqSchema = z.object({
  id: z.string().uuid(),
  question: questionSchema,
  answer: answerSchema,
});
export const eliminarFaqSchema = z.object({ id: z.string().uuid() });
export const reordenarFaqsSchema = z.object({ ids: z.array(z.string().uuid()).min(1) });

/** Create a FAQ, appended after the operator's current last (no atomicity concern beyond a single row
 *  — the display order self-heals on the next reorder). Injectable (ADR-0001). */
export async function crearFaq(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = crearFaqSchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const gym = await getOperatorGym(supabase);

  const { data: last } = await supabase
    .from("faq")
    .select("sort_order")
    .eq("gym_id", gym.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (last?.sort_order ?? -1) + 1;

  const { error } = await supabase
    .from("faq")
    .insert({ gym_id: gym.id, question: input.question, answer: input.answer, sort_order: nextOrder });
  if (error) throw new Error("No se pudo crear la pregunta");
}

/** Edit an existing FAQ (staff-scoped via RLS). Injectable (ADR-0001). */
export async function actualizarFaq(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = actualizarFaqSchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const { data, error } = await supabase
    .from("faq")
    .update({ question: input.question, answer: input.answer })
    .eq("id", input.id)
    .select("id");
  if (error) throw new Error("No se pudo actualizar la pregunta");
  if (!data || data.length === 0) throw new Error("Pregunta no encontrada");
}

/** Delete a FAQ (staff-scoped via RLS). Injectable (ADR-0001). */
export async function eliminarFaq(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = eliminarFaqSchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const { data, error } = await supabase.from("faq").delete().eq("id", input.id).select("id");
  if (error) throw new Error("No se pudo eliminar la pregunta");
  if (!data || data.length === 0) throw new Error("Pregunta no encontrada");
}

/** Persist a new display order: `ids` is the FULL list in its new order; each row's `sort_order`
 *  becomes its index. RLS scopes every update to the caller's own gym (a foreign id silently no-ops).
 *  Injectable (ADR-0001). */
export async function reordenarFaqs(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = reordenarFaqsSchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const results = await Promise.all(
    input.ids.map((id, index) => supabase.from("faq").update({ sort_order: index }).eq("id", id)),
  );
  if (results.some((r) => r.error)) throw new Error("No se pudo reordenar las preguntas");
}

// ── stat ────────────────────────────────────────────────────────────────────

/** One marketing stat pair (e.g. "Miembros activos" / "500+"), operator-authored. `value` is
 *  free-text so the operator can write "500+", "10 años", etc. without a formatting layer. */
export interface StatDTO {
  id: string;
  label: string;
  value: string;
}

/** The public-facing name for the same row shape (Nosotros page). */
export type StatPublicaDTO = StatDTO;

function toStatDTO(row: { id: string; label: string; value: string }): StatDTO {
  return { id: row.id, label: row.label, value: row.value };
}

/** The gym's stats, in display order. RLS scopes rows to the caller's gym (is_member_of). Memoized per request.
 *  @returns the stat list · best-effort: returns [] on error (error is not destructured). */
export const listStats = cache(async (client?: SupabaseServer): Promise<StatDTO[]> => {
  const supabase = client ?? (await createClient());
  const { data } = await supabase.from("stat").select("id, label, value").order("sort_order");
  return (data ?? []).map(toStatDTO);
});

/** A gym's stat tiles in display order, anon + gym-scoped. Best-effort []. Memoized. */
export const getStatsPublicas = cache(
  async (gymId: string, client: SupabaseServer = createAnonClient(gymId)): Promise<StatPublicaDTO[]> => {
    const { data } = await client
      .from("stat")
      .select("id, label, value")
      .eq("gym_id", gymId)
      .order("sort_order");
    return (data ?? []).map(toStatDTO);
  },
);

const labelSchema = z.string().trim().min(1).max(60);
const valueSchema = z.string().trim().min(1).max(30);

export const crearStatSchema = z.object({ label: labelSchema, value: valueSchema });
export const actualizarStatSchema = z.object({ id: z.string().uuid(), label: labelSchema, value: valueSchema });
export const eliminarStatSchema = z.object({ id: z.string().uuid() });
export const reordenarStatsSchema = z.object({ ids: z.array(z.string().uuid()).min(1) });

/** Create a stat, appended after the operator's current last (no atomicity concern beyond a single
 *  row — the display order self-heals on the next reorder). Injectable (ADR-0001). */
export async function crearStat(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = crearStatSchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const gym = await getOperatorGym(supabase);

  const { data: last } = await supabase
    .from("stat")
    .select("sort_order")
    .eq("gym_id", gym.id)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();
  const nextOrder = (last?.sort_order ?? -1) + 1;

  const { error } = await supabase
    .from("stat")
    .insert({ gym_id: gym.id, label: input.label, value: input.value, sort_order: nextOrder });
  if (error) throw new Error("No se pudo crear el stat");
}

/** Edit an existing stat (staff-scoped via RLS). Injectable (ADR-0001). */
export async function actualizarStat(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = actualizarStatSchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const { data, error } = await supabase
    .from("stat")
    .update({ label: input.label, value: input.value })
    .eq("id", input.id)
    .select("id");
  if (error) throw new Error("No se pudo actualizar el stat");
  if (!data || data.length === 0) throw new Error("Stat no encontrado");
}

/** Delete a stat (staff-scoped via RLS). Injectable (ADR-0001). */
export async function eliminarStat(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = eliminarStatSchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const { data, error } = await supabase.from("stat").delete().eq("id", input.id).select("id");
  if (error) throw new Error("No se pudo eliminar el stat");
  if (!data || data.length === 0) throw new Error("Stat no encontrado");
}

/** Persist a new display order: `ids` is the FULL list in its new order; each row's `sort_order`
 *  becomes its index. RLS scopes every update to the caller's own gym (a foreign id silently no-ops).
 *  Injectable (ADR-0001). */
export async function reordenarStats(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = reordenarStatsSchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const results = await Promise.all(
    input.ids.map((id, index) => supabase.from("stat").update({ sort_order: index }).eq("id", id)),
  );
  if (results.some((r) => r.error)) throw new Error("No se pudo reordenar los stats");
}
