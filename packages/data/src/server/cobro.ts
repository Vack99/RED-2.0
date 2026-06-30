import "server-only";

import { cache } from "react";

import { createClient, type SupabaseServer } from "./supabase";

/** Safe cobro DTO for the cuenta "Datos de cobro" section — no id / user_id.
 *  The cobro row is the source for the {datos_pago} plantilla token (token
 *  injection into a message body lands with the retención editor).
 *
 *  NOTE: the `acepta*` flags are ADVISORY, not enforced. They are NOT applied at
 *  the venta intake — vender offers every payment method regardless. Today they
 *  drive only the cuenta "métodos" summary count. Gating the intake by accepted
 *  method is a future product decision, not current behavior. */
export interface CobroDTO {
  titular: string | null;
  banco: string | null;
  clabe: string | null;
  tarjeta: string | null;
  aceptaEfectivo: boolean;
  aceptaTransferencia: boolean;
  aceptaTarjeta: boolean;
}

/**
 * The operator's datos de cobro, as a safe DTO. RLS scopes the row to
 * (select auth.uid()); returns null until the cobro row is seeded. Memoized
 * per request.
 *
 * @returns the cobro DTO, or null when no row exists · throws on DB error.
 */
export const getCobro = cache(
  async (client?: SupabaseServer): Promise<CobroDTO | null> => {
    const supabase = client ?? (await createClient());
    const { data, error } = await supabase
      .from("cobro")
      .select(
        "titular, banco, clabe, tarjeta, acepta_efectivo, acepta_transferencia, acepta_tarjeta",
      )
      .maybeSingle();
    if (error) throw error;
    if (!data) return null;

    return {
      titular: data.titular,
      banco: data.banco,
      clabe: data.clabe,
      tarjeta: data.tarjeta,
      aceptaEfectivo: data.acepta_efectivo,
      aceptaTransferencia: data.acepta_transferencia,
      aceptaTarjeta: data.acepta_tarjeta,
    };
  },
);
