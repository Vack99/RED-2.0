import "server-only";

import { randomUUID } from "node:crypto";

import { z } from "zod";

import { baseParaStack, calcVigenciaEnd, diasRestantes, stackPaquete } from "@gym/domain/rules";
import type { Clases, CompraPaquete, MetodoPago, PlantillaContext, Saldo } from "@gym/domain/types";
import { asClienteId, asPaqueteId, type ClienteId, type PaqueteId } from "@gym/domain/ids";
import { addDays, firstName, fmtShort, hoyEnZona, iniciales, isTelValido, parseDay } from "@gym/format";
import { createClient, type SupabaseServer } from "./supabase";

import { requireOperator } from "./_auth";
import { getCobro } from "./cobro";
import { getOperatorGym } from "./gym";
import { getPaquetes } from "./paquetes";
import { resolverIdentidad } from "./perfil";
import { fmtClases, fmtDatosPago, fmtDias, fmtPrecios, renderMensajes } from "./plantilla-ctx";
import { listarPlantillas, type MensajeDTO } from "./plantillas";

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
    nuevoEmail: z.string().trim().optional(),
    clienteId: z.string().transform(asClienteId).optional(),
    paqueteId: z.string().min(1).transform(asPaqueteId),
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
  mensajes: MensajeDTO[];
  /** The email captured for a NEW client — the invite funnel's target (design §3); null otherwise. The
   *  action reads this to decide whether to auto-send the invite (mode NEW + email) and to render "enviada
   *  a {email}" on the recibo. Never a `.email()`-validated value (the sale path never gates on email). */
  emailIngresado: string | null;
}

/**
 * The post-sale invite state the recibo renders (design §3). Derived by the ACTION after the best-effort
 * send — never by `crearVenta` (the send happens in the server-action layer, non-blocking of the sale).
 * `no-aplica` = an EXISTENTE sale (the invite funnel is the NEW-client door).
 */
export type InviteState =
  | { estado: "enviada"; email: string }
  | { estado: "fallo"; email: string }
  | { estado: "sin-email" }
  | { estado: "no-aplica" };

/** `crearVenta`'s result plus the invite state the action stitches on — the exact shape the recibo reads. */
export type ReciboResult = VentaResult & { invite: InviteState };

const clasesFromDb = (n: number | null): Clases => (n === null ? "ilimitado" : n);

// Unbrand entity ids at the DB edge — kind-checked, so swapping a cliente id and
// a paquete id is a compile error here, not a silent wrong-row lookup (audit
// 2026-06-30).
const forCliente = (id: ClienteId): string => id;
const forPaquete = (id: PaqueteId): string => id;

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
 * Ruling C13: the `registrar_venta` RPC (ADR-0005) re-derives price/saldo/vence from
 * the paquete row inside one locked transaction — this DAL sends only identity +
 * paquete_id + metodo + an idempotency key (C6). The domain math below feeds the
 * recibo DISPLAY only. (Task 4 landed the RPC + this minimal caller; task 5 finishes
 * the DAL slim-down so the recibo reads the RPC's returned saldo/vence directly.)
 */
export async function crearVenta(raw: unknown, client?: SupabaseServer): Promise<VentaResult> {
  const input = crearVentaSchema.parse(raw);
  const supabase = client ?? (await createClient());

  // Presence check only — the RPC stamps the operator server-side (SECURITY
  // INVOKER), so the sub is discarded here (matches prior behavior).
  await requireOperator(supabase);
  const { timezone: tz } = await getOperatorGym(supabase);

  // Package facts come from the DB, never the client. The paquete read and (in
  // existing mode) the cliente read are independent, so fire them concurrently;
  // NEW mode has no cliente row to fetch, so its slot resolves to null. The
  // not-found checks below preserve the exact per-row error messages.
  const isNew = input.mode === "new";
  const [paqRes, cliRes] = await Promise.all([
    supabase
      .from("paquetes")
      .select("nombre, clases, vigencia_tipo, vigencia_dias, precio")
      .eq("id", forPaquete(input.paqueteId))
      .single(),
    input.mode === "existing"
      ? supabase
          .from("clientes")
          .select("id, nombre, tel, clases_restantes, vence")
          .eq("id", forCliente(input.clienteId!))
          .single()
      : Promise.resolve(null),
  ]);

  const { data: paq, error: paqErr } = paqRes;
  if (paqErr || !paq) throw new Error("Paquete no encontrado");

  const hoy = hoyEnZona(tz);
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

  if (input.mode === "existing") {
    const { data: cli, error } = cliRes!;
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

  // Ruling C13: the RPC re-derives price/balance/vence from the paquete row inside
  // one locked transaction — the client sends ONLY identity + p_paquete_id + p_metodo
  // + an idempotency key (C6). The TS saldo math above now feeds the recibo DISPLAY
  // only; it no longer crosses the write boundary.
  // NOTE (task 4): this is the minimal contract adjustment to keep the gate green —
  // task 5 finishes the DAL slim-down (drops the now-display-only math + the recibo
  // reads the RPC's returned saldo/vence).
  const { data: result, error: rpcErr } = await supabase
    .rpc("registrar_venta", {
      p_metodo: input.metodo,
      p_paquete_id: forPaquete(input.paqueteId),
      p_idempotency_key: randomUUID(),
      ...(input.mode === "existing" && { p_cliente_id: forCliente(input.clienteId!) }),
      ...(input.mode === "new" && { p_nombre: nombre, p_tel: tel }),
      ...(input.mode === "new" && input.nuevoEmail ? { p_email: input.nuevoEmail } : {}),
    })
    .single();
  if (rpcErr || !result) throw new Error("No se pudo registrar la venta");

  // Best-effort message context, read AFTER the sale RPC already committed. A
  // missing cobro/paquetes only blanks a token (fmt* tolerate null/[]) — it never
  // fails the sale result.
  const [{ data: perfil }, plantillas, paquetes, cobro] = await Promise.all([
    supabase.from("perfil").select("negocio, coach, ciudad").maybeSingle(),
    listarPlantillas(supabase),
    getPaquetes(supabase, tz).catch(() => []),
    getCobro(supabase).catch(() => null),
  ]);
  // Resolve the identity defaults in one place (kept off getPerfil — it's
  // cache()-wrapped and would break the injected-fake test). The recibo omits a
  // blank ciudad, so this consumer keeps the empty-string behavior.
  const id = resolverIdentidad(perfil ?? { negocio: null, coach: null, ciudad: null });
  const negocio = id.negocio;
  const coach = id.coach;
  const ciudad = id.ciudad ?? "";

  const venceDisplay = fmtShort(nuevoVence);
  const fechaDisplay = fmtShort(hoy);
  const metodoDisplay = input.metodo === "pendiente" ? "POR PAGAR" : input.metodo.toUpperCase();

  // The recibo confirmation is a stored, editable plantilla; renderPlantilla is
  // the single home for message rendering, and the brand comes from the operator's
  // perfil via the {negocio} token — never a hard-coded "Forge Bootcamp". Every
  // template is rendered against the sale context so the picker can offer them all.
  const ctx: PlantillaContext = {
    nombre: firstName(nombre),
    clases: fmtClases(nuevoSaldo.clases),
    paquete: paq.nombre,
    vence: venceDisplay,
    dias: fmtDias(diasRestantes(nuevoVence, hoy)),
    precios: fmtPrecios(paquetes),
    datos_pago: fmtDatosPago(cobro),
    negocio,
  };
  const mensajes: MensajeDTO[] = renderMensajes(plantillas, ctx);

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
    mensajes,
    emailIngresado: isNew ? (input.nuevoEmail || null) : null,
  };
}
