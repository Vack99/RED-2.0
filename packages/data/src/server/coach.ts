import "server-only";

import { cache } from "react";
import { z } from "zod";

import { createClient, type SupabaseServer } from "./supabase";
import { requireOperator } from "./_auth";
import { optionalText } from "./_zod";
import { getOperatorGym } from "./gym";

/**
 * A coach on the operator's roster (PRD #36 US11 — the client app's roster
 * showcase reads this same shape). Deactivation, not deletion: a coach
 * referenced by an existing `class_session_coach` row must stay renderable, so
 * there is no delete path (matches #37's migration — `coach` has no delete
 * RLS policy by design).
 */
export interface CoachDTO {
  id: string;
  nombre: string;
  iniciales: string;
  rol: string;
  especialidad: string | null;
  bio: string | null;
  activo: boolean;
  orden: number;
}

interface CoachRow {
  id: string;
  name: string;
  initials: string;
  role: string;
  specialty: string | null;
  bio: string | null;
  is_active: boolean;
  sort_order: number;
}

function toDTO(row: CoachRow): CoachDTO {
  return {
    id: row.id,
    nombre: row.name,
    iniciales: row.initials,
    rol: row.role,
    especialidad: row.specialty,
    bio: row.bio,
    activo: row.is_active,
    orden: row.sort_order,
  };
}

const COACH_COLUMNS = "id, name, initials, role, specialty, bio, is_active, sort_order";

/** The full roster (active + inactive) for the cuenta authoring list, ordered
 *  for display — the authoring surface must keep rendering a deactivated coach
 *  (its `activo` flag drives the dimmed "INACTIVO" row). RLS (`is_member_of`)
 *  scopes rows to the caller's gym — no manual `gym_id` filter. Ties in
 *  `sort_order` (e.g. two freshly-created rows, both defaulting to 0) fall
 *  back to insertion order.
 *  @returns the roster · best-effort: returns [] on error. */
export const getCoaches = cache(async (client?: SupabaseServer): Promise<CoachDTO[]> => {
  const supabase = client ?? (await createClient());
  const { data } = await supabase
    .from("coach")
    .select(COACH_COLUMNS)
    .order("sort_order")
    .order("created_at");
  return (data ?? []).map(toDTO);
});

const coachFields = {
  nombre: z.string().trim().min(1).max(80),
  iniciales: z.string().trim().min(1).max(4),
  rol: z.string().trim().min(1).max(60),
  especialidad: optionalText(120),
  bio: optionalText(500),
};

export const crearCoachSchema = z.object(coachFields);
export const actualizarCoachSchema = z.object({ id: z.string().uuid(), ...coachFields });
export const establecerCoachActivoSchema = z.object({ id: z.string().uuid(), activo: z.boolean() });
export const reordenarCoachesSchema = z.object({ ids: z.array(z.string().uuid()).min(1) });

/** Create a coach. `sort_order` stays at its DB default (0) — a fresh row
 *  reads at the end via the `created_at` tiebreak above; explicit reordering
 *  is `reordenarCoaches`'s job, not creation's. No RPC (#37 shipped table +
 *  RLS only, no live DDL this slice): `is_staff_of(gym_id)` is the write
 *  boundary, so `gym_id` must be supplied — resolved server-side via
 *  `getOperatorGym`, never client input. */
export async function crearCoach(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = crearCoachSchema.parse(raw);
  const supabase = client ?? (await createClient());
  const { id: gymId } = await getOperatorGym(supabase);
  const { error } = await supabase.from("coach").insert({
    gym_id: gymId,
    name: input.nombre,
    initials: input.iniciales,
    role: input.rol,
    specialty: input.especialidad,
    bio: input.bio,
  });
  if (error) throw new Error("No se pudo crear el coach");
}

/** Edit a coach's text fields (owner-scoped via RLS). */
export async function actualizarCoach(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = actualizarCoachSchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const { error } = await supabase
    .from("coach")
    .update({
      name: input.nombre,
      initials: input.iniciales,
      role: input.rol,
      specialty: input.especialidad,
      bio: input.bio,
    })
    .eq("id", input.id);
  if (error) throw new Error("No se pudo actualizar el coach");
}

/** Activate/deactivate a coach — the deletion substitute (issue #43): a
 *  deactivated coach's `activo=false` flag is what any picker filters on,
 *  while the row stays a valid FK target and keeps rendering wherever
 *  `getCoaches` (or a session join) still cites it. */
export async function establecerCoachActivo(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = establecerCoachActivoSchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const { error } = await supabase.from("coach").update({ is_active: input.activo }).eq("id", input.id);
  if (error) throw new Error("No se pudo actualizar el coach");
}

/** Persist a full reorder: `ids` in the caller's desired display order, each
 *  written to `sort_order = ` its array index. The cuenta editor computes the
 *  new order locally (move up/down) and calls this once per commit. */
export async function reordenarCoaches(raw: unknown, client?: SupabaseServer): Promise<void> {
  const { ids } = reordenarCoachesSchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const results = await Promise.all(
    ids.map((id, index) => supabase.from("coach").update({ sort_order: index }).eq("id", id)),
  );
  if (results.some((r) => r.error)) throw new Error("No se pudo reordenar a los coaches");
}
