import "server-only";

import { z } from "zod";

import { calcVigenciaEnd, diasRestantes, renderPlantilla, stackPaquete } from "@/domain/rules";
import type { Clases, CompraPaquete, Saldo } from "@/domain/types";
import { addDays, fmtShort } from "@/lib/date";
import { hoyChihuahua, parseDay, toIsoDay } from "@/lib/fecha";
import { firstName, iniciales } from "@/lib/format";
import type { Database } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

import { getPlantilla } from "./plantillas";

export type Metodo = "efectivo" | "transferencia" | "tarjeta" | "pendiente";

export const crearVentaSchema = z
  .object({
    mode: z.enum(["new", "existing"]),
    nuevoNombre: z.string().optional(),
    nuevoTel: z.string().optional(),
    clienteId: z.string().optional(),
    paqueteId: z.string().min(1),
    metodo: z.enum(["efectivo", "transferencia", "tarjeta", "pendiente"]),
  })
  .refine(
    (v) =>
      v.mode === "existing"
        ? !!v.clienteId
        : (v.nuevoNombre ?? "").trim().length >= 3 &&
          (v.nuevoTel ?? "").replace(/\D/g, "").length >= 8,
    { message: "Datos del cliente incompletos" },
  );

export type CrearVentaInput = z.infer<typeof crearVentaSchema>;

export interface VentaResult {
  folio: number;
  fechaDisplay: string;
  compradoDisplay: string;
  venceDisplay: string;
  cliente: { id: string; nombre: string; tel: string; inicial: string; isNew: boolean };
  paquete: { nombre: string; vigencia: string; precio: number };
  metodo: Metodo;
  metodoDisplay: string;
  negocio: string;
  ciudad: string;
  coach: string;
  waText: string;
}

type ClienteSaldoRow = Pick<
  Database["public"]["Tables"]["clientes"]["Row"],
  "id" | "nombre" | "tel" | "clases_restantes" | "vence"
>;

const clasesFromDb = (n: number | null): Clases => (n === null ? "ilimitado" : n);
const clasesToDb = (c: Clases): number | null => (c === "ilimitado" ? null : c);

function vigenciaDisplay(tipo: string, dias: number | null): string {
  return tipo === "mes" ? "todo el mes" : `${dias} días`;
}

/**
 * Register a sale: stack the package onto the client's saldo (brief Q5),
 * persist the mutated running balance (ADR-0004), insert the venta with a
 * DB-generated folio, and return everything the recibo renders.
 *
 * Auth is checked here (DAL); RLS is the hard boundary. All business math is
 * delegated to src/domain — never reimplemented. `hoy` is the Chihuahua-local
 * calendar day so the domain's local-midnight math is correct (ADR-0003).
 */
export async function crearVenta(raw: unknown): Promise<VentaResult> {
  const input = crearVentaSchema.parse(raw);
  const supabase = await createClient();

  const { data: claims } = await supabase.auth.getClaims();
  const userId = claims?.claims?.sub;
  if (!userId) throw new Error("No autenticado");

  // Package facts come from the DB, never the client.
  const { data: paq, error: paqErr } = await supabase
    .from("paquetes")
    .select("nombre, clases, vigencia_tipo, vigencia_dias, precio")
    .eq("id", input.paqueteId)
    .single();
  if (paqErr || !paq) throw new Error("Paquete no encontrado");

  const hoy = hoyChihuahua();
  const compraDias =
    paq.vigencia_tipo === "mes"
      ? diasRestantes(calcVigenciaEnd(hoy, "mes"), hoy)
      : (paq.vigencia_dias ?? 0);
  const compra: CompraPaquete = { clases: clasesFromDb(paq.clases), dias: compraDias };

  // Resolve or create the cliente.
  let cliente: ClienteSaldoRow;
  let isNew = false;
  if (input.mode === "existing") {
    const { data, error } = await supabase
      .from("clientes")
      .select("id, nombre, tel, clases_restantes, vence")
      .eq("id", input.clienteId!)
      .single();
    if (error || !data) throw new Error("Cliente no encontrado");
    cliente = data;
  } else {
    const { data, error } = await supabase
      .from("clientes")
      .insert({ user_id: userId, nombre: input.nuevoNombre!.trim(), tel: input.nuevoTel!.trim() })
      .select("id, nombre, tel, clases_restantes, vence")
      .single();
    if (error || !data) throw new Error("No se pudo crear el cliente");
    cliente = data;
    isNew = true;
  }

  // Only a still-valid package contributes to the stack (forfeit on expiry, Q2).
  const diasRest = cliente.vence ? diasRestantes(parseDay(cliente.vence), hoy) : 0;
  const saldoActual: Saldo =
    diasRest > 0
      ? { clases: clasesFromDb(cliente.clases_restantes), dias: diasRest }
      : { clases: 0, dias: 0 };

  const nuevoSaldo = stackPaquete(saldoActual, compra);
  const nuevoVence = addDays(hoy, nuevoSaldo.dias);

  const { error: updErr } = await supabase
    .from("clientes")
    .update({
      clases_restantes: clasesToDb(nuevoSaldo.clases),
      vence: toIsoDay(nuevoVence),
      paquete_nombre: paq.nombre,
    })
    .eq("id", cliente.id);
  if (updErr) throw new Error("No se pudo actualizar el saldo del cliente");

  const { data: venta, error: ventaErr } = await supabase
    .from("ventas")
    .insert({
      user_id: userId,
      cliente_id: cliente.id,
      paquete_nombre: paq.nombre,
      clases: paq.clases,
      vigencia_tipo: paq.vigencia_tipo,
      vigencia_dias: paq.vigencia_dias,
      monto: paq.precio,
      metodo: input.metodo,
    })
    .select("folio")
    .single();
  if (ventaErr || !venta) throw new Error("No se pudo registrar la venta");

  const [{ data: perfil }, reciboBody] = await Promise.all([
    supabase.from("perfil").select("negocio, coach, ciudad").maybeSingle(),
    getPlantilla("recibo"),
  ]);
  const negocio = perfil?.negocio?.trim() || "FORGE";
  const coach = perfil?.coach?.trim() || "COACH";
  const ciudad = perfil?.ciudad?.trim() || "";

  const venceDisplay = fmtShort(nuevoVence);
  const fechaDisplay = fmtShort(hoy);
  const metodoDisplay = input.metodo === "pendiente" ? "POR PAGAR" : input.metodo.toUpperCase();

  // The recibo confirmation is a stored, editable plantilla; renderPlantilla is
  // the single home for message rendering, and the brand comes from the operator's
  // perfil via the {negocio} token — never a hard-coded "Forge Bootcamp".
  const waText = renderPlantilla(reciboBody, {
    nombre: firstName(cliente.nombre),
    paquete: paq.nombre,
    vence: venceDisplay,
    negocio,
  });

  return {
    folio: venta.folio,
    fechaDisplay,
    compradoDisplay: fechaDisplay,
    venceDisplay,
    cliente: {
      id: cliente.id,
      nombre: cliente.nombre,
      tel: cliente.tel,
      inicial: iniciales(cliente.nombre),
      isNew,
    },
    paquete: {
      nombre: paq.nombre,
      vigencia: vigenciaDisplay(paq.vigencia_tipo, paq.vigencia_dias),
      precio: paq.precio,
    },
    metodo: input.metodo,
    metodoDisplay,
    negocio,
    ciudad,
    coach,
    waText,
  };
}
