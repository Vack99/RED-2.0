import "server-only";

import { cache } from "react";
import { z } from "zod";

import { asClassTypeId } from "@gym/domain/ids";
import { createClient, type SupabaseServer } from "./supabase";
import { requireOperator } from "./_auth";
import { optionalText } from "./_zod";
import { getOperatorGym } from "./gym";

/** An ordered display-list row shared by `class_type_workblock` ("Calentamiento",
 *  "AMRAP" segments) and `class_type_bring_item` ("Toalla", "Botella de agua") —
 *  identical shape and RLS class, so one DTO serves both (#37's migration). */
export interface ClassTypeItemDTO {
  id: string;
  etiqueta: string;
  orden: number;
}

/** A class type in the operator's curated catalog (PRD #36 §(i)). No delete
 *  path (matches #37's migration — no delete RLS policy on any of the five
 *  catalog tables); a later slice's job if ever needed. */
export interface ClassTypeDTO {
  id: string;
  nombre: string;
  sala: string | null;
  nivel: string | null;
  descripcion: string | null;
  duracionMin: number | null;
  /** Ordered workout segments (`class_type_workblock`), add/edit/reorder only. */
  bloques: ClassTypeItemDTO[];
  /** Ordered "qué traer" items (`class_type_bring_item`), add/edit/reorder only. */
  porTraer: ClassTypeItemDTO[];
}

interface ItemRow {
  id: string;
  label: string;
  sort_order: number;
}

interface ClassTypeRow {
  id: string;
  name: string;
  sala: string | null;
  level: string | null;
  description: string | null;
  default_duration_min: number | null;
  class_type_workblock: ItemRow[] | null;
  class_type_bring_item: ItemRow[] | null;
}

function toItemDTO(row: ItemRow): ClassTypeItemDTO {
  return { id: row.id, etiqueta: row.label, orden: row.sort_order };
}

function toDTO(row: ClassTypeRow): ClassTypeDTO {
  return {
    id: row.id,
    nombre: row.name,
    sala: row.sala,
    nivel: row.level,
    descripcion: row.description,
    duracionMin: row.default_duration_min,
    bloques: (row.class_type_workblock ?? []).map(toItemDTO),
    porTraer: (row.class_type_bring_item ?? []).map(toItemDTO),
  };
}

const CLASS_TYPE_COLUMNS = `
  id, name, sala, level, description, default_duration_min,
  class_type_workblock ( id, label, sort_order ),
  class_type_bring_item ( id, label, sort_order )
`;

/** The full catalog with its ordered children embedded — one round trip for
 *  the whole cuenta authoring list (the same shape a future Agenda tipo
 *  picker/"+ new type" flow and the client showcase read). RLS
 *  (`is_member_of`) scopes rows to the caller's gym.
 *  @returns the catalog · best-effort: returns [] on error. */
export const getClassTypes = cache(async (client?: SupabaseServer): Promise<ClassTypeDTO[]> => {
  const supabase = client ?? (await createClient());
  const { data } = await supabase
    .from("class_type")
    .select(CLASS_TYPE_COLUMNS)
    .order("name")
    .order("sort_order", { referencedTable: "class_type_workblock" })
    .order("sort_order", { referencedTable: "class_type_bring_item" });
  return (data ?? []).map(toDTO);
});

const classTypeFields = {
  nombre: z.string().trim().min(1).max(60),
  sala: optionalText(60),
  nivel: optionalText(40),
  descripcion: optionalText(300),
  duracionMin: z.number().int().positive().nullable().optional().transform((v) => v ?? null),
};

export const crearClassTypeSchema = z.object(classTypeFields);
export const actualizarClassTypeSchema = z.object({ id: z.string().uuid(), ...classTypeFields });

/** Duplicate-name → the friendly es-MX message; anything else → the caller's
 *  generic message (crear/actualizar word it differently). Keeps the
 *  constraint-name gate (not the bare 23505 code) so an unrelated unique
 *  violation is never mislabeled (mirrors actualizarPaquete). */
function mapClassTypeError(
  error: { message?: string; details?: string } | null,
  generic: string,
): never {
  const haystack = `${error?.message ?? ""} ${error?.details ?? ""}`;
  if (/class_type_name_gym_uq/.test(haystack)) {
    throw new Error("Ya existe un tipo de clase con ese nombre");
  }
  throw new Error(generic);
}

/** Create a class type. No RPC (#37 shipped table + RLS only, no live DDL this
 *  slice): `is_staff_of(gym_id)` is the write boundary, so `gym_id` is
 *  resolved server-side via `getOperatorGym`, never client input. The "+ new
 *  tipo" flow in a future Agenda editor calls this same seam (issue #43). */
export async function crearClassType(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = crearClassTypeSchema.parse(raw);
  const supabase = client ?? (await createClient());
  const { id: gymId } = await getOperatorGym(supabase);
  const { error } = await supabase.from("class_type").insert({
    gym_id: gymId,
    name: input.nombre,
    sala: input.sala,
    level: input.nivel,
    description: input.descripcion,
    default_duration_min: input.duracionMin,
  });
  if (error) mapClassTypeError(error, "No se pudo crear el tipo de clase");
}

/** Edit a class type's fields (owner-scoped via RLS). */
export async function actualizarClassType(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = actualizarClassTypeSchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const { error } = await supabase
    .from("class_type")
    .update({
      name: input.nombre,
      sala: input.sala,
      level: input.nivel,
      description: input.descripcion,
      default_duration_min: input.duracionMin,
    })
    .eq("id", input.id);
  if (error) mapClassTypeError(error, "No se pudo actualizar el tipo de clase");
}

// ── Ordered children (bloques/porTraer) ──────────────────────────────────
// class_type_workblock and class_type_bring_item are identical in shape and
// RLS class (#37) — one generic implementation, parameterized by the caller-
// facing key, serves both real call sites (bloques editor, porTraer editor).
// No delete path (matches #37 — no delete RLS policy on either table).

type ItemKind = "bloques" | "porTraer";
const ITEM_TABLE: Record<ItemKind, "class_type_workblock" | "class_type_bring_item"> = {
  bloques: "class_type_workblock",
  porTraer: "class_type_bring_item",
};

export const crearClassTypeItemSchema = z.object({
  classTypeId: z.string().uuid().transform(asClassTypeId),
  etiqueta: z.string().trim().min(1).max(60),
  orden: z.number().int().min(0),
});
export const actualizarClassTypeItemSchema = z.object({
  id: z.string().uuid(),
  etiqueta: z.string().trim().min(1).max(60),
});
export const reordenarClassTypeItemsSchema = z.object({ ids: z.array(z.string().uuid()).min(1) });

/** Append one row to a class type's ordered list. `orden` is caller-supplied
 *  (the editor already holds the full array, so it knows the next index —
 *  matches `reordenarCoaches`'s "client computes order" contract). */
export async function crearClassTypeItem(
  kind: ItemKind,
  raw: unknown,
  client?: SupabaseServer,
): Promise<void> {
  const input = crearClassTypeItemSchema.parse(raw);
  const supabase = client ?? (await createClient());
  const { id: gymId } = await getOperatorGym(supabase);
  const { error } = await supabase.from(ITEM_TABLE[kind]).insert({
    gym_id: gymId,
    class_type_id: input.classTypeId,
    label: input.etiqueta,
    sort_order: input.orden,
  });
  if (error) throw new Error("No se pudo agregar");
}

/** Edit one row's label. */
export async function actualizarClassTypeItem(
  kind: ItemKind,
  raw: unknown,
  client?: SupabaseServer,
): Promise<void> {
  const input = actualizarClassTypeItemSchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const { error } = await supabase.from(ITEM_TABLE[kind]).update({ label: input.etiqueta }).eq("id", input.id);
  if (error) throw new Error("No se pudo actualizar");
}

async function reordenarItems(kind: ItemKind, raw: unknown, client?: SupabaseServer): Promise<void> {
  const { ids } = reordenarClassTypeItemsSchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const table = ITEM_TABLE[kind];
  const results = await Promise.all(
    ids.map((id, index) => supabase.from(table).update({ sort_order: index }).eq("id", id)),
  );
  if (results.some((r) => r.error)) throw new Error("No se pudo reordenar");
}

/** Persist a full reorder of one class type's bloques (workblocks). */
export const reordenarBloques = (raw: unknown, client?: SupabaseServer) =>
  reordenarItems("bloques", raw, client);

/** Persist a full reorder of one class type's porTraer items (bring items). */
export const reordenarPorTraer = (raw: unknown, client?: SupabaseServer) =>
  reordenarItems("porTraer", raw, client);

// Curried per-kind exports — the action layer (cuenta/actions.ts) calls these
// directly, so no raw "kind" string threads through the "use server" boundary.
export const crearBloque = (raw: unknown, client?: SupabaseServer) => crearClassTypeItem("bloques", raw, client);
export const crearPorTraer = (raw: unknown, client?: SupabaseServer) => crearClassTypeItem("porTraer", raw, client);
export const actualizarBloque = (raw: unknown, client?: SupabaseServer) =>
  actualizarClassTypeItem("bloques", raw, client);
export const actualizarPorTraer = (raw: unknown, client?: SupabaseServer) =>
  actualizarClassTypeItem("porTraer", raw, client);
