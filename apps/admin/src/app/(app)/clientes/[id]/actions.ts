"use server";

import { togglePase, type TogglePaseResult } from "@gym/data/server/asistencia";
import { actualizarCliente, reenviarInvitacion, type ActualizarClienteResult } from "@gym/data/server/clientes";
import type { EnvioResult } from "@gym/data/server/invitaciones";

/** Mark/undo today's attendance from the ficha. Thin write seam over the DAL;
 *  (app) reads are dynamic (cookie-bound), so no cache invalidation is needed. */
export async function togglePaseAction(raw: unknown): Promise<TogglePaseResult> {
  return togglePase(raw);
}

/** Edit a client's identity (nombre + tel + optional email backfill) from the ficha. Thin write seam
 *  over the DAL; (app) reads are dynamic (cookie-bound), so the client refreshes the route after a
 *  successful save and no cache invalidation is needed (matches togglePaseAction). The result carries
 *  the auto-invite outcome (design §3 — issue #71) so the sheet can toast it. */
export async function actualizarClienteAction(raw: unknown): Promise<ActualizarClienteResult> {
  return actualizarCliente(raw);
}

/** REENVIAR (+ "enviar invitación" when sin_invitar) on the ficha (design §3 — issue #71): re-send the
 *  SAME claim code via the same best-effort rail the sale path uses. Thin write seam over the DAL; the
 *  caller refreshes the route on success so the badge's 'Invitada {fecha}' picks up the fresh
 *  invitacion_enviada_at (matches actualizarClienteAction / togglePaseAction). */
export async function reenviarInvitacionAction(clienteId: string): Promise<EnvioResult> {
  return reenviarInvitacion(clienteId);
}
