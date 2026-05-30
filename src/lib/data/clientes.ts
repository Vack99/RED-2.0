import "server-only";

import { cache } from "react";

import { iniciales } from "@/lib/format";
import { createClient } from "@/lib/supabase/server";

export interface ClienteLiteDTO {
  id: string;
  nombre: string;
  tel: string;
  inicial: string;
  /** Active package label, or "Sin paquete". */
  paqueteLabel: string;
}

/** Minimal roster for the venta client-picker, ordered by name. */
export const getClientesLite = cache(async (): Promise<ClienteLiteDTO[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("clientes")
    .select("id, nombre, tel, paquete_nombre")
    .order("nombre");

  if (!data) return [];

  return data.map((c) => ({
    id: c.id,
    nombre: c.nombre,
    tel: c.tel,
    inicial: iniciales(c.nombre),
    paqueteLabel: c.paquete_nombre ?? "Sin paquete",
  }));
});
