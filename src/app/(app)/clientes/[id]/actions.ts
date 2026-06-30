"use server";

import { togglePase, type TogglePaseResult } from "@gym/data/server/asistencia";
import { actualizarCliente } from "@gym/data/server/clientes";

/** Mark/undo today's attendance from the ficha. Thin write seam over the DAL;
 *  (app) reads are dynamic (cookie-bound), so no cache invalidation is needed. */
export async function togglePaseAction(raw: unknown): Promise<TogglePaseResult> {
  return togglePase(raw);
}

/** Edit a client's identity (nombre + tel) from the ficha. Thin write seam over the DAL; (app)
 *  reads are dynamic (cookie-bound), so the client refreshes the route after a successful save and
 *  no cache invalidation is needed (matches togglePaseAction). */
export async function actualizarClienteAction(raw: unknown): Promise<void> {
  return actualizarCliente(raw);
}
