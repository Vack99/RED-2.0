"use server";

import { togglePase, type TogglePaseOutcome } from "@gym/data/server/asistencia";
import { actualizarCliente, reenviarInvitacion } from "@gym/data/server/clientes";
import type { EnvioResult } from "@gym/data/server/invitaciones";
import { EmailEnUsoError } from "@gym/data/server/ventas";

/** The ficha edit switches on this: a saved edit (with the auto-invite outcome), or the RPC's
 *  email-in-use refusal (clientes_email_gym_uq) surfaced as a message the sheet toasts verbatim —
 *  a typed result, NOT a throw, since prod Next.js masks thrown action messages (matches vender). */
export type ActualizarClienteActionResult =
  | { ok: true; invite: EnvioResult | null }
  | { ok: false; mensaje: string };

/** Mark/undo today's attendance from the ficha. Thin write seam over the DAL;
 *  (app) reads are dynamic (cookie-bound), so no cache invalidation is needed.
 *  An RPC refusal arrives as `{ ok: false, message }` (typed result, NOT a throw —
 *  prod Next.js masks thrown action messages) so the ficha can toast the reason. */
export async function togglePaseAction(raw: unknown): Promise<TogglePaseOutcome> {
  return togglePase(raw);
}

/** Edit a client's identity (nombre + tel + optional email backfill) from the ficha. Thin write seam
 *  over the DAL; (app) reads are dynamic (cookie-bound), so the client refreshes the route after a
 *  successful save and no cache invalidation is needed (matches togglePaseAction). The result carries
 *  the auto-invite outcome (design §3 — issue #71) so the sheet can toast it. The DAL's EmailEnUsoError
 *  (clientes_email_gym_uq collision) is mapped to a typed non-throwing result so the sheet toasts the
 *  actionable Spanish reason instead of the generic failure (same discipline as vender's crearVentaAction). */
export async function actualizarClienteAction(raw: unknown): Promise<ActualizarClienteActionResult> {
  try {
    const { invite } = await actualizarCliente(raw);
    return { ok: true, invite };
  } catch (e) {
    if (e instanceof EmailEnUsoError) return { ok: false, mensaje: e.message };
    throw e;
  }
}

/** REENVIAR (+ "enviar invitación" when sin_invitar) on the ficha (design §3 — issue #71): re-send the
 *  SAME claim code via the same best-effort rail the sale path uses. Thin write seam over the DAL; the
 *  caller refreshes the route on success so the badge's 'Invitada {fecha}' picks up the fresh
 *  invitacion_enviada_at (matches actualizarClienteAction / togglePaseAction). */
export async function reenviarInvitacionAction(clienteId: string): Promise<EnvioResult> {
  return reenviarInvitacion(clienteId);
}
