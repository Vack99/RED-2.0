import "server-only";

import { z } from "zod";

import { createClient, type SupabaseServer } from "./supabase";

/**
 * The member booking DAL seam (PRD #49 S3) over the atomic `reservar_clase` RPC
 * (ADR-0005/0010 §4). The RPC owns the whole money math — the guarded consume, the
 * ilimitado exemption, the zero/expired/full/duplicate guards, all in one
 * transaction — so this seam is deliberately thin: validate the session id, call the
 * RPC, and return a typed result the screen renders without try/catch. The RPC's
 * raise messages are already member-facing es-MX ("Clase llena", "Sin clases
 * disponibles", …), surfaced verbatim. `client` injectable (ADR-0001).
 */
export type ReservarResultado =
  | { ok: true; reservationId: string; clasesRestantes: number | null }
  | { ok: false; error: string };

const sessionIdSchema = z.string().uuid();

export async function reservarClase(
  rawSessionId: unknown,
  client?: SupabaseServer,
): Promise<ReservarResultado> {
  const parsed = sessionIdSchema.safeParse(rawSessionId);
  if (!parsed.success) return { ok: false, error: "Sesión inválida" };

  const supabase = client ?? (await createClient());
  const { data, error } = await supabase.rpc("reservar_clase", { p_session_id: parsed.data });
  if (error) return { ok: false, error: error.message || "No se pudo reservar" };

  const row = data?.[0];
  if (!row) return { ok: false, error: "No se pudo reservar" };
  return { ok: true, reservationId: row.reservation_id, clasesRestantes: row.clases_restantes };
}
