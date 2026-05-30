import "server-only";

import { cache } from "react";

import { createClient } from "@/lib/supabase/server";

/** WhatsApp template keys stored in the plantillas table. */
export type PlantillaClave = "recibo" | "recordatorio" | "renovar" | "ultima";

/**
 * The operator's stored WhatsApp template bodies, keyed by `clave`. RLS scopes
 * the rows to (select auth.uid()). This DAL only fetches bodies — token
 * substitution (incl. the brand) happens at the call site via the domain
 * `renderPlantilla`, so message strings are never hand-built. Memoized per request.
 */
export const getPlantillas = cache(async (): Promise<Record<string, string>> => {
  const supabase = await createClient();
  const { data } = await supabase.from("plantillas").select("clave, body");

  const map: Record<string, string> = {};
  for (const p of data ?? []) map[p.clave] = p.body;
  return map;
});

/** A single stored template body by clave, or "" if it isn't seeded. */
export async function getPlantilla(clave: PlantillaClave): Promise<string> {
  const all = await getPlantillas();
  return all[clave] ?? "";
}
