import "server-only";

import { z } from "zod";

import { createClient, type SupabaseServer } from "./supabase";

/**
 * The member notifications-preference DAL seam (PRD #49 S5) over the self-scoped
 * `set_notificaciones` DEFINER toggle (ADR-0013 §5 / ADR-0005). A PREFERENCE ONLY —
 * an in-app flag with no delivery channel; this seam persists the socio's choice and
 * nothing more. Same thin shape as the booking seams: validate the boolean, call the
 * RPC, return a typed result the overlay renders without try/catch. The RPC self-pins
 * to the caller's own cliente row (auth.uid()), so no member/row id crosses this seam.
 * `client` injectable (ADR-0001).
 */
export type NotificacionesResultado =
  | { ok: true; activadas: boolean }
  | { ok: false; error: string };

const enabledSchema = z.boolean();

export async function setNotificaciones(
  rawEnabled: unknown,
  client?: SupabaseServer,
): Promise<NotificacionesResultado> {
  const parsed = enabledSchema.safeParse(rawEnabled);
  if (!parsed.success) return { ok: false, error: "Preferencia inválida" };

  const supabase = client ?? (await createClient());
  const { data, error } = await supabase.rpc("set_notificaciones", { p_enabled: parsed.data });
  if (error) return { ok: false, error: error.message || "No se pudo guardar" };

  return { ok: true, activadas: data as boolean };
}
