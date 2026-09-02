import "server-only";

import { cache } from "react";
import { z } from "zod";

import type { AgendaResultado } from "./agenda";
import { requireOperator } from "./_auth";
import { getOperatorGym } from "./gym";
import { createClient, type SupabaseServer } from "./supabase";

/**
 * The catalog seam the Agenda editor reads (PRD #36 e): the coach multi-select and
 * the extensible tipo picker. RLS (`is_staff_of`) is the hard boundary, but a
 * multi-gym staffer's `gym_membership` rows OR together (ADR-0013's per-row
 * predicate spans every gym they staff) — so a read with no explicit filter
 * returns EVERY staffed gym's rows, not just the one the current host names.
 * Every read here therefore also carries `.eq("gym_id", …)` from getOperatorGym
 * — a scope selector, not the boundary (spec 2026-07-13 §1.1; this file's own
 * bug before the fix, sibling gyms' coaches/tipos bleeding into the NUEVA CLASE
 * sheet under the wrong chrome). The mint stamps gym_id from getOperatorGym so
 * the `is_staff_of` insert policy passes. `client` injectable (ADR-0001).
 */

export interface CoachOptionDTO {
  id: string;
  label: string;
}

export interface ClassTypeDTO {
  id: string;
  name: string;
}

/** The gym's active coaches, ordered by the operator's sort then name. */
export const getCoaches = cache(async (client?: SupabaseServer): Promise<CoachOptionDTO[]> => {
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const gym = await getOperatorGym(supabase);
  const { data, error } = await supabase
    .from("coach")
    .select("id, name")
    .eq("gym_id", gym.id)
    .eq("is_active", true)
    .order("sort_order")
    .order("name");
  if (error) throw error;
  return (data ?? []).map((c) => ({ id: c.id, label: c.name }));
});

/** The gym's class types (tipo catalog), alphabetized — the tipo picker's options. */
export const getClassTypes = cache(async (client?: SupabaseServer): Promise<ClassTypeDTO[]> => {
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const gym = await getOperatorGym(supabase);
  const { data, error } = await supabase
    .from("class_type")
    .select("id, name")
    .eq("gym_id", gym.id)
    .order("name");
  if (error) throw error;
  return (data ?? []).map((t) => ({ id: t.id, name: t.name }));
});

export const crearClassTypeSchema = z.object({ name: z.string().trim().min(1).max(60) });
export type CrearClassTypeInput = z.infer<typeof crearClassTypeSchema>;

/**
 * Mint a class type (the tipo picker's `+`). A single-row insert is already atomic,
 * so no RPC (ADR-0005 is for multi-statement writes); gym_id comes from the
 * operator's membership and the `is_staff_of` policy enforces the boundary. The
 * `unique(gym_id, name)` collision surfaces as a typed result, never a throw.
 */
export async function crearClassType(
  raw: unknown,
  client?: SupabaseServer,
): Promise<AgendaResultado<{ id: string }>> {
  const parsed = crearClassTypeSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Nombre inválido" };

  try {
    const supabase = client ?? (await createClient());
    await requireOperator(supabase);
    const { id: gymId } = await getOperatorGym(supabase);
    const { data, error } = await supabase
      .from("class_type")
      .insert({ gym_id: gymId, name: parsed.data.name })
      .select("id")
      .single();
    if (error || !data) throw new Error(error?.message || "No se pudo crear el tipo de clase");
    return { ok: true, id: data.id };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : "No se pudo crear el tipo de clase" };
  }
}
