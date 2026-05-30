import "server-only";

import { cache } from "react";

import { diasRestantes } from "@/domain/rules";
import { hoyChihuahua, parseDay } from "@/lib/fecha";
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

export interface PaseClienteDTO {
  id: string;
  nombre: string;
  inicial: string;
  paquete: string;
  /** Remaining-classes label, e.g. "Ilimitado", "5 clases", "Sin paquete". */
  clasesLabel: string;
  diasRest: number;
  /** Active package expiring soon (derived, ADR-0002). */
  porVencer: boolean;
}

/** Roster for the pase de lista, with derived saldo display (ADR-0002). */
export const getClientesParaPase = cache(async (): Promise<PaseClienteDTO[]> => {
  const supabase = await createClient();
  const { data } = await supabase
    .from("clientes")
    .select("id, nombre, paquete_nombre, clases_restantes, vence")
    .order("nombre");

  if (!data) return [];

  const hoy = hoyChihuahua();
  return data.map((c) => {
    const diasRest = c.vence ? diasRestantes(parseDay(c.vence), hoy) : 0;
    const clasesLabel = !c.paquete_nombre
      ? "Sin paquete"
      : c.clases_restantes === null
        ? "Ilimitado"
        : `${c.clases_restantes} clase${c.clases_restantes === 1 ? "" : "s"}`;
    return {
      id: c.id,
      nombre: c.nombre,
      inicial: iniciales(c.nombre),
      paquete: c.paquete_nombre ?? "Sin paquete",
      clasesLabel,
      diasRest,
      porVencer: !!c.paquete_nombre && diasRest > 0 && diasRest <= 5,
    };
  });
});
