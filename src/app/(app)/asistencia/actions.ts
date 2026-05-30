"use server";

import { revalidateTag } from "next/cache";

import { togglePase, type TogglePaseResult } from "@/lib/data/asistencia";

/**
 * Thin write seam (ADR-0001): delegate to the DAL (Zod-validates, re-auths,
 * consumes/restores via the domain), then invalidate the clientes + asistencias
 * tags for read-your-writes (see actions in vender for the updateTag rationale).
 */
export async function togglePaseAction(raw: unknown): Promise<TogglePaseResult> {
  const result = await togglePase(raw);
  revalidateTag("clientes", "max");
  revalidateTag("asistencias", "max");
  return result;
}
