import "server-only";

import { cache } from "react";
import { z } from "zod";

import { resumirRoster } from "@gym/domain/rules";
import type { ResumenRoster } from "@gym/domain/types";
import { addDays, fechaChihuahua, hoyChihuahua, iniciales, isTelValido, toIsoDay } from "@gym/format";
import { createClient, type SupabaseServer } from "./supabase";

import { requireOperator } from "./_auth";
import {
  derivarCliente,
  derivarPaseCliente,
  shapeFicha,
  type ClienteDerivado,
  type FichaDerivada,
  type PaseClienteDTO,
} from "./derive";
import { getCobro } from "./cobro";
import { getPaquetes } from "./paquetes";
import { resolverIdentidad } from "./perfil";
import { fmtDatosPago, fmtPrecios } from "./plantilla-ctx";
import { listarPlantillas } from "./plantillas";
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

/** The ficha's rolling attendance window length, in days (ADR/spec 2026-06-01).
 *  One constant, easy to retune; the directory keeps its own this-month count. */
const FICHA_VENTANA_DIAS = 30;

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

    // Deliberate waterfall: await the cliente FIRST so a not-found id returns
    // early without firing the 5 downstream reads. Folding all 6 into one
    // Promise.all would waste 5 queries on every 404; one extra round trip on
    // the happy path is the accepted cost.
    const { data: c } = await supabase
      .from("clientes")
      .select("id, nombre, tel, paquete_nombre, clases_restantes, vence, created_at")
      .eq("id", id)
      .maybeSingle();
    if (!c) return null;

    // Rolling 30-day window (Part A). The lower bound is fixed at today−30d here so
    // this read stays independent of ventasRes inside the Promise.all; an old last
    // purchase (predating the window) is reconciled by the exact count below (Part B).
    const ventanaIso = toIsoDay(addDays(hoy, -FICHA_VENTANA_DIAS));

    const [asistRes, ventasRes, vecinos, perfilRes, plantillas, paquetes, cobro] =
      await Promise.all([
        supabase
          .from("asistencias")
          .select("fecha, hora, consumio")
          .eq("cliente_id", id)
          .is("deleted_at", null)
          .gte("fecha", ventanaIso)
          .order("fecha", { ascending: false }),
        supabase
          .from("ventas")
          .select("fecha, paquete_nombre, monto, metodo, clases, vigencia_tipo, vigencia_dias")
          .eq("cliente_id", id)
          .order("fecha", { ascending: false }),
        getVecinos(id, supabase),
        supabase.from("perfil").select("negocio").maybeSingle(),
        listarPlantillas(supabase),
        getPaquetes(supabase).catch(() => []),
        getCobro(supabase).catch(() => null),
      ]);

    const negocio = resolverIdentidad({
      negocio: perfilRes.data?.negocio ?? null,
      coach: null,
      ciudad: null,
    }).negocio;

    // Classes consumed since the last purchase (Part B clases-gauge denominator):
    // count `consumio` rows with fecha >= the purchase date. The purchase is the
    // saldo anchor `ventas[0]` (newest-first). lastPurchaseIso is the Chihuahua-local
    // calendar day of that timestamptz, matched against asistencias' `date` column.
    const ventas = ventasRes.data ?? [];
    const lastPurchaseIso = ventas[0] ? toIsoDay(fechaChihuahua(ventas[0].fecha)) : null;
    let attendedSincePurchase = 0;
    if (lastPurchaseIso) {
      if (lastPurchaseIso >= ventanaIso) {
        // Common case: the purchase is inside the 30-day window we already fetched,
        // so count the rows in hand — no extra round trip.
        attendedSincePurchase = (asistRes.data ?? []).filter(
          (a) => a.consumio && a.fecha >= lastPurchaseIso,
        ).length;
      } else {
        // Old purchase predating the window: a tiny exact head-count keeps the
        // gauge denominator correct without widening the historial fetch.
        const { count } = await supabase
          .from("asistencias")
          .select("id", { count: "exact", head: true })
          .eq("cliente_id", id)
          .eq("consumio", true)
          .is("deleted_at", null)
          .gte("fecha", lastPurchaseIso);
        attendedSincePurchase = count ?? 0;
      }
    }

    const ficha = shapeFicha(
      c,
      asistRes.data ?? [],
      ventas,
      hoy,
      hoyIso,
      plantillas,
      negocio,
      attendedSincePurchase,
      { precios: fmtPrecios(paquetes), datos_pago: fmtDatosPago(cobro) },
    );

    return { ...ficha, hoyIso, vecinos };
  },
);

/** Identity-edit input (nombre + tel). Trims like crearVenta; tel validity is the canonical
 *  10-digit MX rule (isTelValido), the same rule the DB CHECK (clientes_tel_10_digits_ck) enforces. */
export const actualizarClienteSchema = z.object({
  clienteId: z.string().uuid(),
  nombre: z.string().trim().min(3),
  tel: z.string().trim().refine(isTelValido, { message: "Teléfono inválido" }),
});

export type ActualizarClienteInput = z.infer<typeof actualizarClienteSchema>;

/** Edit a client's identity (nombre + tel). Injectable client (ADR-0001). The actualizar_cliente
 *  RPC re-checks auth.uid() and RLS scopes the UPDATE to the owner (SECURITY INVOKER), so the sub
 *  from the presence check is discarded here (matches crearVenta). */
export async function actualizarCliente(raw: unknown, client?: SupabaseServer): Promise<void> {
  const input = actualizarClienteSchema.parse(raw);
  const supabase = client ?? (await createClient());

  await requireOperator(supabase);

  const { error } = await supabase.rpc("actualizar_cliente", {
    p_cliente_id: input.clienteId,
    p_nombre: input.nombre,
    p_tel: input.tel,
  });
  if (error) throw new Error("No se pudo actualizar el cliente");
}
