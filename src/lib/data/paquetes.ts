import "server-only";

import { cache } from "react";
import { z } from "zod";

import { calcVigenciaEnd } from "@/domain/rules";
import type { Vigencia } from "@/domain/types";
import { fmtShort } from "@/lib/date";
import { hoyChihuahua } from "@/lib/fecha";
import { createClient, type SupabaseServer } from "@/lib/supabase/server";

import { requireOperator } from "./_auth";

export interface PaqueteDTO {
  id: string;
  nombre: string;
  /** Display vigencia, e.g. "20 días" or "todo el mes". */
  vigencia: string;
  /** Expiry if bought today (fmtShort), e.g. "16 jun" — for the "Hasta …" hint. */
  hasta: string;
  precio: number;
  popular: boolean;
}

/** The operator's package catalog, ordered for display.
 *  @returns the package list · best-effort: returns [] on error (error is not
 *  destructured, so any failure reads as an empty catalog). */
export const getPaquetes = cache(
  async (client?: SupabaseServer): Promise<PaqueteDTO[]> => {
    const supabase = client ?? (await createClient());
    const { data } = await supabase
      .from("paquetes")
      .select("id, nombre, vigencia_tipo, vigencia_dias, precio, popular, orden")
      .order("orden");

    if (!data) return [];

    const hoy = hoyChihuahua();
    return data.map((p) => {
      const vigencia: Vigencia = p.vigencia_tipo === "mes" ? "mes" : (p.vigencia_dias ?? 0);
      return {
        id: p.id,
        nombre: p.nombre,
        vigencia: p.vigencia_tipo === "mes" ? "todo el mes" : `${p.vigencia_dias} días`,
        hasta: fmtShort(calcVigenciaEnd(hoy, vigencia)),
        precio: p.precio,
        popular: p.popular,
      };
    });
  },
);

/**
 * The edit payload's trust boundary (the Zod schema, not the client gate):
 * `nombre` 1–40 trimmed chars, `precio` a positive integer (whole pesos, es-MX —
 * no centavos in v1), `popular` a boolean, `id` a uuid. `vigencia`/`clases` are
 * deliberately ABSENT — editing them would change future-buyer grants (crearVenta
 * re-reads them live at sale time), so they are excluded from form AND RPC.
 */
export const actualizarPaqueteSchema = z.object({
  id: z.string().uuid(),
  nombre: z.string().trim().min(1).max(40),
  precio: z.number().int().positive(),
  popular: z.boolean(),
});

/**
 * Edit an existing package's nombre/precio/popular (owner-scoped via RLS). The
 * `actualizar_paquete` RPC is the single place the write happens (ADR-0005) and
 * hard-normalizes vigencia to the 30-day invariant in-DB. Injectable (ADR-0001).
 * A `(user_id, nombre)` unique violation (23505) maps to a friendly es-MX message.
 */
export async function actualizarPaquete(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = actualizarPaqueteSchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const { error } = await supabase.rpc("actualizar_paquete", {
    p_id: input.id,
    p_nombre: input.nombre,
    p_precio: input.precio,
    p_popular: input.popular,
  });
  if (error) {
    // paquetes_nombre_uq (user_id, nombre) → friendly duplicate message; anything else is generic.
    if (error.code === "23505" || /paquetes_nombre_uq/.test(error.message ?? "")) {
      throw new Error("Ya tienes un paquete con ese nombre");
    }
    throw new Error("No se pudo actualizar el paquete");
  }
}
