import "server-only";

import { cache } from "react";
import { z } from "zod";

import { createClient, type SupabaseServer } from "./supabase";

import { requireOperator } from "./_auth";
import { getOperatorGym } from "./gym";

/** One marketing stat pair (e.g. "Miembros activos" / "500+"), operator-authored. `value` is
 *  free-text so the operator can write "500+", "10 años", etc. without a formatting layer. */
export interface StatDTO {
  id: string;
  label: string;
  value: string;
}

/** The gym's stats, in display order. RLS scopes rows to the caller's gym (is_member_of). Memoized per request.
 *  @returns the stat list · best-effort: returns [] on error (error is not destructured). */
export const listStats = cache(async (client?: SupabaseServer): Promise<StatDTO[]> => {
  const supabase = client ?? (await createClient());
  const { data } = await supabase.from("stat").select("id, label, value").order("sort_order");
  return (data ?? []).map((s) => ({ id: s.id, label: s.label, value: s.value }));
});

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
