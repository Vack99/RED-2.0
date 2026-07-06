import "server-only";

import { cache } from "react";
import { z } from "zod";

import { createClient, type SupabaseServer } from "./supabase";

import { requireOperator } from "./_auth";
import { getOperatorGym } from "./gym";

/** One pregunta/respuesta pair, operator-authored. */
export interface FaqDTO {
  id: string;
  question: string;
  answer: string;
}

/** The gym's FAQs, in display order. RLS scopes rows to the caller's gym (is_member_of). Memoized per request.
 *  @returns the FAQ list · best-effort: returns [] on error (error is not destructured). */
export const listFaqs = cache(async (client?: SupabaseServer): Promise<FaqDTO[]> => {
  const supabase = client ?? (await createClient());
  const { data } = await supabase.from("faq").select("id, question, answer").order("sort_order");
  return (data ?? []).map((f) => ({ id: f.id, question: f.question, answer: f.answer }));
});

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
