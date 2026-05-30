"use server";

import { revalidateTag } from "next/cache";

import { crearVenta, type VentaResult } from "@/lib/data/ventas";

/**
 * Thin write seam (ADR-0001): delegate to the DAL — which Zod-validates,
 * re-auths, and runs the domain stacking — then invalidate the clientes cache
 * tag for read-your-writes.
 *
 * The spec called for `updateTag('clientes')`, but `updateTag` relies on the
 * cacheComponents ('use cache') model, which isn't enabled in next.config. We use
 * the equivalent `revalidateTag('clientes', 'max')` (the two-arg form; the
 * single-arg form is deprecated in Next 16). Reads are currently dynamic
 * (cookies), so this is the forward-looking invalidation point for when the DAL
 * adopts `cacheTag('clientes')`.
 */
export async function crearVentaAction(raw: unknown): Promise<VentaResult> {
  const result = await crearVenta(raw);
  revalidateTag("clientes", "max");
  return result;
}
