"use server";

import { togglePase, type TogglePaseOutcome } from "@gym/data/server/asistencia";

/**
 * Thin write seam (ADR-0001): delegate to the DAL (Zod-validates, re-auths,
 * consumes/restores via the domain). No cache invalidation needed — (app)
 * pages read through the cookie-bound Supabase client and render dynamically,
 * so the write is seen on the next read.
 *
 * An RPC refusal arrives as `{ ok: false, message }` (typed result, NOT a
 * throw): production Next.js masks thrown Server Action messages, so the C15/C9
 * reasons ('Paquete vencido', 'Asistencia de clase ya registrada…') must travel
 * as a return value for the pase screen to toast them.
 */
export async function togglePaseAction(raw: unknown): Promise<TogglePaseOutcome> {
  return togglePase(raw);
}
