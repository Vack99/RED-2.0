import "server-only";

import { z } from "zod";

import { diasRestantes } from "@gym/domain/rules";
import type { Clases, MetodoPago, PlantillaContext } from "@gym/domain/types";
import { asClienteId, asPaqueteId, type ClienteId, type PaqueteId } from "@gym/domain/ids";
import { firstName, fmtShort, hoyEnZona, iniciales, isTelValido, parseDay } from "@gym/format";
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
const METODOS = ["efectivo", "transferencia", "tarjeta"] as const satisfies readonly MetodoPago[];

/** The two package sources a sale can have. A discriminated union, not two optional
 *  fields: "both" and "neither" are unrepresentable, not merely rejected.
 *
 *  `clases: null` = ilimitado — a REQUIRED nullable field, so "absent" is a parse
 *  error and null unambiguously means unlimited. (SQL needs an extra
 *  p_custom_ilimitado discriminator for the same job, because an absent argument and
 *  a null one are the same value there. See the RPC edge below.)
 *
 *  Bounds mirror the RPC (spec D6) for a fast, local failure — but the RPC is the
 *  trust boundary and enforces them again. This copy is convenience, not security. */
const paqueteSeleccionSchema = z.discriminatedUnion("tipo", [
  z.object({
    tipo: z.literal("registrado"),
    paqueteId: z.string().min(1).transform(asPaqueteId),
  }),
  z.object({
    tipo: z.literal("personalizado"),
    nombre: z.string().trim().min(3).max(40),
    precio: z.number().int().min(1).max(100_000),
    clases: z.number().int().min(1).max(365).nullable(),
    dias: z.number().int().min(1).max(365),
  }),
]);

export type PaqueteSeleccion = z.infer<typeof paqueteSeleccionSchema>;

export const crearVentaSchema = z
  .object({
    mode: z.enum(["new", "existing"]),
    nuevoNombre: z.string().optional(),
    nuevoTel: z.string().optional(),
    // Optional contact email — captured in NEW mode (invite target) OR backfilled
    // in EXISTING mode on renewal (C7). Never `.email()`-validated: the sale must
    // never gate on it (§3.4). Trimmed so a blank field forwards nothing.
    email: z.string().trim().optional(),
    clienteId: z.string().transform(asClienteId).optional(),
    paquete: paqueteSeleccionSchema,
    metodo: z.enum(METODOS),
    // Submission-stable key (C6): minted once per sale attempt in the vender UI,
    // so a retry after an error replays the SAME sale instead of double-charging.
    idempotencyKey: z.string().uuid(),
    // Explicit operator override of the RPC's duplicate guard (D2).
    forzarNuevo: z.boolean().optional(),
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

/** The RPC's `CLIENTE_DUPLICADO:<id>` raise (D2), surfaced as a typed error so the
 *  vender UI can switch on it to open the "¿Usar existente?" dialog — instead of the
 *  raise being swallowed into the generic failure toast. `existingId` is the matched
 *  same-gym client the operator can sell to as EXISTENTE. */
export class DuplicadoError extends Error {
  constructor(readonly existingId: string) {
    super(`CLIENTE_DUPLICADO:${existingId}`);
    this.name = "DuplicadoError";
  }
}

/** The RPC's C7 backfill-collision raise, verbatim. It IS contract — the
 *  registrar_venta_stacking suite (V13) pins this exact string. */
export const EMAIL_EN_USO_MSG = "Este correo ya pertenece a otro registro de este gym";

/** The RPC refused an EXISTENTE sale because its backfill email already belongs to
 *  another row in the gym (clientes_email_gym_uq). Typed so the operator sees the
 *  actionable Spanish message instead of the generic failure toast — the same
 *  channel discipline as DuplicadoError. */
export class EmailEnUsoError extends Error {
  constructor() {
    super(EMAIL_EN_USO_MSG);
    this.name = "EmailEnUsoError";
  }
}

const clasesFromDb = (n: number | null): Clases => (n === null ? "ilimitado" : n);

// Unbrand entity ids at the DB edge — kind-checked, so swapping a cliente id and
// a paquete id is a compile error here, not a silent wrong-row lookup (audit
// 2026-06-30).
const forCliente = (id: ClienteId): string => id;
const forPaquete = (id: PaqueteId): string => id;

// A 'mes' package is a flat 30 days from purchase (ruling C1) — the label must say so;
// "todo el mes" was the retired month-end semantics and contradicted the printed vence.
function vigenciaDisplay(tipo: string, dias: number | null): string {
  return tipo === "mes" ? "30 días" : `${dias} días`;
}

/**
 * Register a sale by delegating to the `registrar_venta` RPC (ADR-0005), then
 * return everything the recibo renders.
 *
 * Ruling C13/C6: the RPC re-derives price/saldo/vence from the paquete row inside
 * one locked transaction — this DAL sends ONLY identity + p_paquete_id + p_metodo
 * + a caller-supplied idempotency key. No money math crosses the write boundary;
 * the recibo DISPLAY reads the RPC's RETURNED clases_restantes/vence. The reads
 * here (paquete: nombre/vigencia/precio; existing-client: nombre/tel) are
 * DISPLAY-only — the RPC's return carries neither identity field.
 *
 * Auth is checked here (DAL); RLS is the hard boundary. `hoy` is the Chihuahua-local
 * calendar day so day-count display math is correct (ADR-0003).
 */
export async function crearVenta(raw: unknown, client?: SupabaseServer): Promise<VentaResult> {
  const input = crearVentaSchema.parse(raw);
  const supabase = client ?? (await createClient());

  // Presence check only — the RPC stamps the operator server-side, so the sub is
  // discarded here.
  await requireOperator(supabase);
  const { timezone: tz } = await getOperatorGym(supabase);

  // Display-only reads (never cross the write boundary). Paquete + (existing mode)
  // the client's name/tel are independent, so fire them concurrently; NEW mode has
  // no cliente row, so its slot resolves to null.
  const isNew = input.mode === "new";
  const [paqRes, cliRes] = await Promise.all([
    // Display-only read, and ONLY for a registered plan — a custom package has no
    // paquetes row by design (spec §2). Reading here would throw on a valid sale.
    input.paquete.tipo === "personalizado"
      ? Promise.resolve(null)
      : supabase
          .from("paquetes")
          .select("nombre, vigencia_tipo, vigencia_dias, precio")
          .eq("id", forPaquete(input.paquete.paqueteId))
          .single(),
    input.mode === "existing"
      ? supabase
          .from("clientes")
          .select("nombre, tel")
          .eq("id", forCliente(input.clienteId!))
          .single()
      : Promise.resolve(null),
  ]);

  // The recibo's CONCEPTO. For a registered plan it mirrors the paquetes row; for a
  // custom package there IS no row, so it comes from the typed values (always 'dias').
  let reciboPaquete: { nombre: string; vigencia: string; precio: number };
  if (input.paquete.tipo === "personalizado") {
    const c = input.paquete;
    reciboPaquete = { nombre: c.nombre, vigencia: `${c.dias} días`, precio: c.precio };
  } else {
    const { data: paq, error: paqErr } = paqRes!;
    if (paqErr || !paq) throw new Error("Paquete no encontrado");
    reciboPaquete = {
      nombre: paq.nombre,
      vigencia: vigenciaDisplay(paq.vigencia_tipo, paq.vigencia_dias),
      precio: paq.precio,
    };
  }

  let nombre: string;
  let tel: string;
  if (input.mode === "existing") {
    const { data: cli, error } = cliRes!;
    if (error || !cli) throw new Error("Cliente no encontrado");
    nombre = cli.nombre;
    tel = cli.tel;
  } else {
    nombre = input.nuevoNombre!.trim();
    tel = input.nuevoTel!.trim();
  }

  // Ruling C13/C6: the RPC re-derives price/balance/vence in one locked transaction
  // — send ONLY identity + p_paquete_id + p_metodo + the submission-stable key. The
  // email (both modes: NEW invite target / EXISTING C7 backfill) and the explicit
  // dup-guard override are spread only when present.
  const { data: result, error: rpcErr } = await supabase
    .rpc("registrar_venta", {
      p_metodo: input.metodo,
      p_idempotency_key: input.idempotencyKey,
      ...(input.paquete.tipo === "registrado"
        ? { p_paquete_id: forPaquete(input.paquete.paqueteId) }
        : {
            p_custom_nombre: input.paquete.nombre,
            p_custom_precio: input.paquete.precio,
            p_custom_dias: input.paquete.dias,
            // SQL cannot distinguish an absent argument from a null one, and null IS
            // the ilimitado value — so the flag carries what the type already knows.
            ...(input.paquete.clases === null
              ? { p_custom_ilimitado: true }
              : { p_custom_clases: input.paquete.clases }),
          }),
      ...(input.mode === "existing" && { p_cliente_id: forCliente(input.clienteId!) }),
      ...(input.mode === "new" && { p_nombre: nombre, p_tel: tel }),
      ...(input.email ? { p_email: input.email } : {}),
      ...(input.forzarNuevo ? { p_forzar_nuevo: true } : {}),
    })
    .single();
  if (rpcErr) {
    // D2: the RPC's CLIENTE_DUPLICADO:<id> raise is a real decision for the UI, not
    // a generic failure — surface it typed so vender.tsx can offer the dup dialog.
    const dup = rpcErr.message?.match(/CLIENTE_DUPLICADO:(\S+)/);
    if (dup) throw new DuplicadoError(dup[1]);
    // C7: the backfill email already belongs to another row (V13-pinned message) —
    // a refusal the operator can act on, not a generic failure.
    if (rpcErr.message === EMAIL_EN_USO_MSG) throw new EmailEnUsoError();
    throw new Error("No se pudo registrar la venta");
  }
  if (!result) throw new Error("No se pudo registrar la venta");

  const hoy = hoyEnZona(tz);
  const vence = parseDay(result.vence);

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

  // Display fields come from the RPC's RETURNED vence/clases_restantes (C13) — never
  // client-side math. clases_restantes is NULL at runtime for an ilimitado balance.
  const venceDisplay = fmtShort(vence);
  const fechaDisplay = fmtShort(hoy);
  const metodoDisplay = input.metodo.toUpperCase();

  // The recibo confirmation is a stored, editable plantilla; renderPlantilla is
  // the single home for message rendering, and the brand comes from the operator's
  // perfil via the {negocio} token — never a hard-coded "Forge Bootcamp". Every
  // template is rendered against the sale context so the picker can offer them all.
  const ctx: PlantillaContext = {
    nombre: firstName(nombre),
    clases: fmtClases(clasesFromDb(result.clases_restantes)),
    paquete: reciboPaquete.nombre,
    vence: venceDisplay,
    dias: fmtDias(diasRestantes(vence, hoy)),
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
    paquete: reciboPaquete,
    metodo: input.metodo,
    metodoDisplay,
    negocio,
    ciudad,
    coach,
    mensajes,
    emailIngresado: isNew ? (input.email || null) : null,
  };
}
