import "server-only";

import { cache } from "react";
import { z } from "zod";

import { createClient, type SupabaseServer } from "./supabase";
import { requireOperator } from "./_auth";
import { getOperatorGym } from "./gym";

/** One contact-form lead as the admin read surface renders it. `leido` is derived from `read_at`
 *  (stored), never a second stored flag (ADR-0002). No `ip` — the operator never needs the request IP
 *  (it exists only for the intake's per-IP rate limit). */
export interface MensajeDTO {
  id: string;
  nombre: string;
  correo: string;
  mensaje: string;
  leido: boolean;
  createdAt: string;
}

/** The gym's contact-form messages, newest first. RLS (`is_staff_of`) is the hard boundary,
 *  but a multi-gym staffer's `gym_membership` rows OR together (ADR-0013), so it alone would
 *  return every staffed gym's messages — `.eq("gym_id", …)` scopes to the operator's
 *  gym-in-effect (spec 2026-07-13 §1.1). Memoized per request. Best-effort: returns [] on error. */
export const listMensajes = cache(async (client?: SupabaseServer): Promise<MensajeDTO[]> => {
  const supabase = client ?? (await createClient());
  const gym = await getOperatorGym(supabase);
  const { data } = await supabase
    .from("contact_message")
    .select("id, nombre, correo, mensaje, read_at, created_at")
    .eq("gym_id", gym.id)
    .order("created_at", { ascending: false });
  return (data ?? []).map((m) => ({
    id: m.id,
    nombre: m.nombre,
    correo: m.correo,
    mensaje: m.mensaje,
    leido: m.read_at !== null,
    createdAt: m.created_at,
  }));
});

export const marcarLeidoSchema = z.object({ id: z.string().uuid() });

/** Mark one message read (staff-scoped via RLS). Stamps `read_at`; a foreign/already-gone id hits 0
 *  rows and throws. Injectable (ADR-0001). */
export async function marcarLeido(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = marcarLeidoSchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const { data, error } = await supabase
    .from("contact_message")
    .update({ read_at: new Date().toISOString() })
    .eq("id", input.id)
    .select("id");
  if (error) throw new Error("No se pudo marcar el mensaje");
  if (!data || data.length === 0) throw new Error("Mensaje no encontrado");
}
