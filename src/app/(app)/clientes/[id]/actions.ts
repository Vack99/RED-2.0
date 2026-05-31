"use server";

import { togglePase, type TogglePaseResult } from "@/lib/data/asistencia";

/** Mark/undo today's attendance from the ficha. Thin write seam over the DAL;
 *  (app) reads are dynamic (cookie-bound), so no cache invalidation is needed. */
export async function togglePaseAction(raw: unknown): Promise<TogglePaseResult> {
  return togglePase(raw);
}
