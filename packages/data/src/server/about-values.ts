import "server-only";

import { cache } from "react";
import { z } from "zod";

import { createClient, type SupabaseServer } from "./supabase";

import { requireOperator } from "./_auth";
import { getOperatorGym } from "./gym";

/** One "quiénes somos" value card (e.g. "Comunidad" / "Entrenamos juntos, no solos."), operator-authored. */
export interface AboutValueDTO {
  id: string;
  title: string;
  description: string;
}

/** The gym's values, in display order. RLS scopes rows to the caller's gym (is_member_of). Memoized per request.
 *  @returns the value list · best-effort: returns [] on error (error is not destructured). */
export const listAboutValues = cache(async (client?: SupabaseServer): Promise<AboutValueDTO[]> => {
  const supabase = client ?? (await createClient());
  const { data } = await supabase
    .from("about_value")
    .select("id, title, description")
    .order("sort_order");
  return (data ?? []).map((v) => ({ id: v.id, title: v.title, description: v.description }));
});

const tituloSchema = z.string().trim().min(1).max(60);
const descripcionSchema = z.string().trim().min(1).max(400);

export const crearAboutValueSchema = z.object({ title: tituloSchema, description: descripcionSchema });
export const actualizarAboutValueSchema = z.object({
  id: z.string().uuid(),
  title: tituloSchema,
  description: descripcionSchema,
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
