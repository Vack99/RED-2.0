import "server-only";

import { cache } from "react";

import { resumirRoster } from "@/domain/rules";
import type { ResumenRoster } from "@/domain/types";
import { hoyChihuahua, toIsoDay } from "@/lib/fecha";
import { iniciales } from "@/lib/format";
import { createClient, type SupabaseServer } from "@/lib/supabase/server";

import {
  derivarCliente,
  derivarPaseCliente,
  shapeFicha,
  type ClienteDerivado,
  type FichaDerivada,
  type PaseClienteDTO,
} from "./derive";
import { getPlantilla } from "./plantillas";
import { getVecinos, type Vecinos } from "./roster-nav";

export type { PaseClienteDTO, FichaAsistencia, FichaPago } from "./derive";

export interface ClienteLiteDTO {
  id: string;
  nombre: string;
  tel: string;
  inicial: string;
  /** Active package label, or "Sin paquete". */
  paqueteLabel: string;
}

/** Minimal roster for the venta client-picker, ordered by name. */
export const getClientesLite = cache(
  async (client?: SupabaseServer): Promise<ClienteLiteDTO[]> => {
    const supabase = client ?? (await createClient());
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
  },
);

/** Roster for the pase de lista, derived-at-read (ADR-0002): a thin fetch that
 *  defers each row to the pure, tested derivarPaseCliente. `porVencer` is the
 *  domain's por_vencer (días OR clases), shared with the directory — not an
 *  inline `<= 5` that drops the clases dimension. */
export const getClientesParaPase = cache(
  async (client?: SupabaseServer): Promise<PaseClienteDTO[]> => {
    const supabase = client ?? (await createClient());
    const { data } = await supabase
      .from("clientes")
      .select("id, nombre, tel, paquete_nombre, clases_restantes, vence")
      .order("nombre");

    if (!data) return [];

    const hoy = hoyChihuahua();
    return data.map((c) => derivarPaseCliente(c, hoy));
  },
);

function monthStartIso(hoy: Date): string {
  return toIsoDay(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
}

/** Full roster, derived-at-read with this month's attendance count per client. */
export const getClientesRoster = cache(
  async (client?: SupabaseServer): Promise<ClienteDerivado[]> => {
    const supabase = client ?? (await createClient());
    const hoy = hoyChihuahua();

    const [clientesRes, asistRes] = await Promise.all([
      supabase
        .from("clientes")
        .select("id, nombre, tel, paquete_nombre, clases_restantes, vence")
        .order("nombre"),
      supabase
        .from("asistencias")
        .select("cliente_id")
        .is("deleted_at", null)
        .gte("fecha", monthStartIso(hoy)),
    ]);

    const clientes = clientesRes.data;
    if (!clientes) return [];

    const counts: Record<string, number> = {};
    for (const a of asistRes.data ?? []) counts[a.cliente_id] = (counts[a.cliente_id] ?? 0) + 1;

    return clientes.map((c) => derivarCliente(c, hoy, counts[c.id] ?? 0));
  },
);

/** The two roster headline counts (vigentes / totalActivos) for the dashboard,
 *  derived-at-read (ADR-0002). The full getClientesRoster is for the directory —
 *  it needs every cliente + asistEsteMes, so it fires a whole-month asistencias
 *  query. The dashboard reads only the two counts, and `estado` never reads
 *  asistencias, so this slim read skips that join and the `.order` entirely. */
export const getRosterResumen = cache(
  async (client?: SupabaseServer): Promise<ResumenRoster> => {
    const supabase = client ?? (await createClient());
    const hoy = hoyChihuahua();

    const { data } = await supabase
      .from("clientes")
      .select("id, nombre, tel, paquete_nombre, clases_restantes, vence");

    if (!data) return { vigentes: 0, totalActivos: 0 };

    const estados = data.map((c) => derivarCliente(c, hoy, 0).estado);
    return resumirRoster(estados);
  },
);

/** Everything the ficha (client detail) renders: the pure derivation (FichaDerivada,
 *  shaped + tested in derive.ts) plus the I/O-sourced today + swipe neighbors. */
export type ClienteFichaDTO = FichaDerivada & {
  hoyIso: string;
  vecinos: Vecinos;
};

/** The ficha, derived-at-read (ADR-0002): a thin fetch that defers all shaping to
 *  the pure, tested shapeFicha; the wrapper owns only I/O + assembling hoyIso/vecinos. */
export const getClienteFicha = cache(
  async (id: string, client?: SupabaseServer): Promise<ClienteFichaDTO | null> => {
    const supabase = client ?? (await createClient());
    const hoy = hoyChihuahua();
    const hoyIso = toIsoDay(hoy);

    const { data: c } = await supabase
      .from("clientes")
      .select("id, nombre, tel, paquete_nombre, clases_restantes, vence, created_at")
      .eq("id", id)
      .maybeSingle();
    if (!c) return null;

    const [asistRes, ventasRes, vecinos, perfilRes, recordatorioBody] = await Promise.all([
      supabase
        .from("asistencias")
        .select("fecha, hora")
        .eq("cliente_id", id)
        .is("deleted_at", null)
        .gte("fecha", monthStartIso(hoy))
        .order("fecha", { ascending: false }),
      supabase
        .from("ventas")
        .select("fecha, paquete_nombre, monto, metodo, clases, vigencia_tipo, vigencia_dias")
        .eq("cliente_id", id)
        .order("fecha", { ascending: false }),
      getVecinos(id, supabase),
      supabase.from("perfil").select("negocio").maybeSingle(),
      getPlantilla("recordatorio", supabase),
    ]);

    const negocio = perfilRes.data?.negocio?.trim() || "FORGE";
    const ficha = shapeFicha(
      c,
      asistRes.data ?? [],
      ventasRes.data ?? [],
      hoy,
      hoyIso,
      recordatorioBody,
      negocio,
    );

    return { ...ficha, hoyIso, vecinos };
  },
);
