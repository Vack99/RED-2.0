"use server";

import { togglePase, type TogglePaseResult } from "@gym/data/server/asistencia";

/**
 * Thin write seam (ADR-0001): delegate to the DAL (Zod-validates, re-auths,
 * consumes/restores via the domain). No cache invalidation needed — (app)
 * pages read through the cookie-bound Supabase client and render dynamically,
 * so the write is seen on the next read.
 */
export async function togglePaseAction(raw: unknown): Promise<TogglePaseResult> {
  return togglePase(raw);
}
