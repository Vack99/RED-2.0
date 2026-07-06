import "server-only";

import { cache } from "react";
import { z } from "zod";

import { createClient, type SupabaseServer } from "./supabase";

import { requireOperator } from "./_auth";
import { getOperatorGym } from "./gym";

/** One instalación card (e.g. "Área de pesas" / "Equipo completo de pesas libres."), operator-authored. */
export interface FacilityDTO {
  id: string;
  name: string;
  description: string;
}

/** The gym's facilities, in display order. RLS scopes rows to the caller's gym (is_member_of). Memoized per request.
 *  @returns the facility list · best-effort: returns [] on error (error is not destructured). */
export const listFacilities = cache(async (client?: SupabaseServer): Promise<FacilityDTO[]> => {
  const supabase = client ?? (await createClient());
  const { data } = await supabase
    .from("facility")
    .select("id, name, description")
    .order("sort_order");
  return (data ?? []).map((f) => ({ id: f.id, name: f.name, description: f.description }));
});

const nombreSchema = z.string().trim().min(1).max(60);
const descripcionSchema = z.string().trim().min(1).max(400);

export const crearFacilitySchema = z.object({ name: nombreSchema, description: descripcionSchema });
export const actualizarFacilitySchema = z.object({
  id: z.string().uuid(),
  name: nombreSchema,
  description: descripcionSchema,
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
