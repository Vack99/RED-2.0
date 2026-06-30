import "server-only";

import { cache } from "react";
import { z } from "zod";

import { calcVigenciaEnd } from "@gym/domain/rules";
import type { Vigencia } from "@gym/domain/types";
import { fmtShort, hoyChihuahua } from "@gym/format";
import { createClient, type SupabaseServer } from "@/lib/supabase/server";

import { requireOperator } from "./_auth";

export interface PaqueteDTO {
  id: string;
  nombre: string;
  /** Class grant, NULL = ilimitado. The editor sets this (1..30 or null) and the
   *  display `nombre` is DERIVED from it in-DB, so label and grant cannot drift. */
  clases: number | null;
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
      .select("id, nombre, clases, vigencia_tipo, vigencia_dias, precio, popular, orden")
      .order("orden");

    if (!data) return [];

    const hoy = hoyChihuahua();
    return data.map((p) => {
      const vigencia: Vigencia = p.vigencia_tipo === "mes" ? "mes" : (p.vigencia_dias ?? 0);
      return {
        id: p.id,
        nombre: p.nombre,
        clases: p.clases,
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
 * `clases` the real class grant — an integer 1..30, or null = ilimitado;
 * `precio` a positive integer (whole pesos, es-MX — no centavos in v1);
 * `popular` a boolean; `id` a uuid. There is NO `nombre` input: the display
 * label is DERIVED from `clases` in-DB ("{n} clases" / "1 clase" / "Ilimitado"),
 * so the label and the grant can never drift. `vigencia` stays absent (the RPC
 * hard-normalizes it to the 30-day invariant).
 */
export const actualizarPaqueteSchema = z.object({
  id: z.string().uuid(),
  precio: z.number().int().positive(),
  popular: z.boolean(),
  clases: z.number().int().min(1).max(30).nullable(),
});

/**
 * Edit an existing package's clases/precio/popular (owner-scoped via RLS). The
 * `actualizar_paquete` RPC is the single place the write happens (ADR-0005): it
 * DERIVES the display nombre from clases, enforces the single-favorite invariant
 * (promoting one demotes the others atomically), and hard-normalizes vigencia to
 * the 30-day invariant. Injectable (ADR-0001).
 *
 * `clases` is the nullable RPC arg (mirrors registrar_venta): a number is spread
 * in as `p_clases`, and null (ilimitado) OMITS the key so the RPC's DEFAULT NULL
 * applies — keeps the generated types honest, no `as any`. A derived-nombre
 * collision surfaces as a `paquetes_nombre_uq` unique violation (23505) and maps
 * to a friendly es-MX message.
 */
export async function actualizarPaquete(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = actualizarPaqueteSchema.parse(raw);
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  const { error } = await supabase.rpc("actualizar_paquete", {
    p_id: input.id,
    p_precio: input.precio,
    p_popular: input.popular,
    ...(input.clases !== null && { p_clases: input.clases }),
  });
  if (error) {
    // paquetes_nombre_uq (user_id, nombre) → another package already derives to
    // this class count; friendly duplicate message. Gate on the CONSTRAINT NAME,
    // not the bare 23505 code: the single-favorite index (paquetes_one_popular)
    // is also a 23505 and must NOT be mislabeled as a duplicate-clases. Anything
    // else falls through to the generic message.
    const haystack = `${error.message ?? ""} ${error.details ?? ""}`;
    if (/paquetes_nombre_uq/.test(haystack)) {
      throw new Error("Ya tienes un paquete con esa cantidad de clases");
    }
    throw new Error("No se pudo actualizar el paquete");
  }
}
