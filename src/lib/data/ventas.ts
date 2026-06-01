import "server-only";

import { z } from "zod";

import { baseParaStack, calcVigenciaEnd, diasRestantes, renderPlantilla, stackPaquete } from "@/domain/rules";
import type { Clases, CompraPaquete, MetodoPago, Saldo } from "@/domain/types";
import { addDays, fmtShort } from "@/lib/date";
import { hoyChihuahua, parseDay, toIsoDay } from "@/lib/fecha";
import { firstName, iniciales, isTelValido } from "@/lib/format";
import { createClient, type SupabaseServer } from "@/lib/supabase/server";

import { requireOperator } from "./_auth";
import { getPlantilla } from "./plantillas";

/** The venta write seam's payment method — an alias for the canonical domain
 *  MetodoPago (vender imports this as MetodoEnum; recibo display-casing is its
 *  own concern at the render site). */
export type Metodo = MetodoPago;

// Zod values DERIVED from MetodoPago: `satisfies` makes a value drifting from
// the canonical type a compile error, not a silent runtime divergence.
const METODOS = ["efectivo", "transferencia", "tarjeta", "pendiente"] as const satisfies readonly MetodoPago[];

export const crearVentaSchema = z
  .object({
    mode: z.enum(["new", "existing"]),
    nuevoNombre: z.string().optional(),
    nuevoTel: z.string().optional(),
    clienteId: z.string().optional(),
    paqueteId: z.string().min(1),
    metodo: z.enum(METODOS),
  })
  .refine(
    (v) =>
      v.mode === "existing"
        ? !!v.clienteId
        : (v.nuevoNombre ?? "").trim().length >= 3 && isTelValido(v.nuevoTel ?? ""),
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
 *
 * The mutate-saldo + insert-venta pair is one atomic transaction via the
 * `registrar_venta` RPC (ADR-0005): the math stays here in TS, the DB does only
 * the write. Optional RPC args are omitted (not passed null) so the function's
 * DEFAULT NULL applies — keeps the generated types honest, no `as any`.
 */
export async function crearVenta(raw: unknown, client?: SupabaseServer): Promise<VentaResult> {
  const input = crearVentaSchema.parse(raw);
  const supabase = client ?? (await createClient());

  // Presence check only — the RPC stamps the operator server-side (SECURITY
  // INVOKER), so the sub is discarded here (matches prior behavior).
  await requireOperator(supabase);

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

  // Resolve the carried-forward base. An existing client's still-valid balance
  // carries (an expired one is forfeited, brief Q2); a brand-new client starts
  // from an EMPTY saldo — the purchase is their first balance (slice #3 spec).
  // Note: a new client's null DB columns must NOT be read as "ilimitado" — that
  // conflation is the bug this wiring fixes.
  let saldoActual: Saldo;
  let nombre: string;
  let tel: string;
  const isNew = input.mode === "new";

  if (input.mode === "existing") {
    const { data: cli, error } = await supabase
      .from("clientes")
      .select("id, nombre, tel, clases_restantes, vence")
      .eq("id", input.clienteId!)
      .single();
    if (error || !cli) throw new Error("Cliente no encontrado");
    nombre = cli.nombre;
    tel = cli.tel;
    const diasRest = cli.vence ? diasRestantes(parseDay(cli.vence), hoy) : 0;
    saldoActual = baseParaStack({ clases: clasesFromDb(cli.clases_restantes), dias: diasRest });
  } else {
    nombre = input.nuevoNombre!.trim();
    tel = input.nuevoTel!.trim();
    saldoActual = { clases: 0, dias: 0 };
  }

  const nuevoSaldo = stackPaquete(saldoActual, compra);
  const nuevoVence = addDays(hoy, nuevoSaldo.dias);
  const nuevoClases = clasesToDb(nuevoSaldo.clases);

  // One atomic write: upsert the cliente's saldo + insert the venta (folio from
  // the DB sequence), in a single transaction. RLS scopes both writes to the
  // operator (SECURITY INVOKER). Optional args are spread in only when non-null
  // so the RPC's DEFAULT NULL handles ilimitado saldo / mes-package nulls / the
  // new-client id without passing `null` into a `number?` param.
  const { data: result, error: rpcErr } = await supabase
    .rpc("registrar_venta", {
      p_nombre: nombre,
      p_tel: tel,
      p_paquete_nombre: paq.nombre,
      p_vigencia_tipo: paq.vigencia_tipo,
      p_monto: paq.precio,
      p_metodo: input.metodo,
      p_vence: toIsoDay(nuevoVence),
      ...(input.mode === "existing" && { p_cliente_id: input.clienteId! }),
      ...(nuevoClases !== null && { p_clases_restantes: nuevoClases }),
      ...(paq.clases !== null && { p_clases: paq.clases }),
      ...(paq.vigencia_dias !== null && { p_vigencia_dias: paq.vigencia_dias }),
    })
    .single();
  if (rpcErr || !result) throw new Error("No se pudo registrar la venta");

  const [{ data: perfil }, reciboBody] = await Promise.all([
    supabase.from("perfil").select("negocio, coach, ciudad").maybeSingle(),
    getPlantilla("recibo", supabase),
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
    nombre: firstName(nombre),
    paquete: paq.nombre,
    vence: venceDisplay,
    negocio,
  });

  return {
    folio: result.folio,
    fechaDisplay,
    compradoDisplay: fechaDisplay,
    venceDisplay,
    cliente: {
      id: result.cliente_id,
      nombre,
      tel,
      inicial: iniciales(nombre),
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
