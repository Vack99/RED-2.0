import "server-only";

import { cache } from "react";

import { calcVigenciaEnd } from "@/domain/rules";
import type { Vigencia } from "@/domain/types";
import { fmtShort } from "@/lib/date";
import { hoyChihuahua } from "@/lib/fecha";
import { createClient } from "@/lib/supabase/server";

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

/** The operator's package catalog, ordered for display. */
export const getPaquetes = cache(async (): Promise<PaqueteDTO[]> => {
  const supabase = await createClient();
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
});
