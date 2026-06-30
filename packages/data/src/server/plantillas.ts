import "server-only";

import { cache } from "react";
import { z } from "zod";

import { createClient, type SupabaseServer } from "./supabase";

import { requireOperator } from "./_auth";

/** A stored WhatsApp template (freeform, named). */
export interface PlantillaDTO {
  id: string;
  nombre: string;
  body: string;
}

/** A template rendered for a specific send context (token-substituted text). */
export interface MensajeDTO {
  id: string;
  nombre: string;
  texto: string;
}

/** The operator's templates, in creation order (oldest first). RLS scopes rows to (select auth.uid()). Memoized per request.
 *  @returns the template list · best-effort: returns [] on error (error is not destructured). */
export const listarPlantillas = cache(async (client?: SupabaseServer): Promise<PlantillaDTO[]> => {
  const supabase = client ?? (await createClient());
  const { data } = await supabase.from("plantillas").select("id, nombre, body").order("created_at");
  return (data ?? []).map((p) => ({ id: p.id, nombre: p.nombre, body: p.body }));
});

const nombreSchema = z.string().trim().min(1).max(40);
const bodySchema = z.string().trim().min(1).max(1000);

export const crearPlantillaSchema = z.object({ nombre: nombreSchema, body: bodySchema });
export const actualizarPlantillaSchema = z.object({ id: z.string().uuid(), nombre: nombreSchema, body: bodySchema });
export const eliminarPlantillaSchema = z.object({ id: z.string().uuid() });

/** Create a template. The crear_plantilla RPC enforces the cap-of-4 atomically. Injectable (ADR-0001). */
export async function crearPlantilla(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = crearPlantillaSchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const { error } = await supabase.rpc("crear_plantilla", { p_nombre: input.nombre, p_body: input.body });
  if (error) throw new Error("No se pudo crear la plantilla");
}

/** Edit a template (owner-scoped via RLS). Injectable (ADR-0001). */
export async function actualizarPlantilla(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = actualizarPlantillaSchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const { error } = await supabase.rpc("actualizar_plantilla", { p_id: input.id, p_nombre: input.nombre, p_body: input.body });
  if (error) throw new Error("No se pudo actualizar la plantilla");
}

/** Delete a template (owner-scoped via RLS). Injectable (ADR-0001). */
export async function eliminarPlantilla(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = eliminarPlantillaSchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const { error } = await supabase.rpc("eliminar_plantilla", { p_id: input.id });
  if (error) throw new Error("No se pudo eliminar la plantilla");
}

/** Seed the canonical default set if the operator has none (idempotent in the RPC). Injectable. */
export async function sembrarPlantillasDefault(client?: SupabaseServer): Promise<void> {
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  // sembrar_plantillas_default takes no args (Args: never) — call without a payload.
  const { error } = await supabase.rpc("sembrar_plantillas_default");
  if (error) throw new Error("No se pudieron crear las plantillas predeterminadas");
}
