"use server";

import { revalidateTag } from "next/cache";

import { togglePase, type TogglePaseResult } from "@/lib/data/asistencia";

/** Mark/undo today's attendance from the ficha. Thin write seam over the DAL. */
export async function togglePaseAction(raw: unknown): Promise<TogglePaseResult> {
  const result = await togglePase(raw);
  revalidateTag("clientes", "max");
  revalidateTag("asistencias", "max");
  return result;
}
