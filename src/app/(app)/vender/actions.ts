"use server";

import { crearVenta, type VentaResult } from "@/lib/data/ventas";

/**
 * Thin write seam (ADR-0001): delegate to the DAL, which Zod-validates,
 * re-auths, and runs the domain stacking.
 *
 * No cache invalidation is needed: every (app) page reads through the
 * cookie-bound Supabase server client, which forces dynamic rendering, so a
 * write is reflected on the next read automatically. If a read ever opts into
 * `'use cache'` + `cacheTag('clientes')`, add the matching `revalidateTag` here.
 */
export async function crearVentaAction(raw: unknown): Promise<VentaResult> {
  return crearVenta(raw);
}
