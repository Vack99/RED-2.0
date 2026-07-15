import "server-only";

import { cache } from "react";
import { z } from "zod";

import type { ResumenRoster } from "@gym/domain/types";
import { addDays, fechaEnZona, hoyEnZona, iniciales, isTelValido, toIsoDay } from "@gym/format";
import { createClient, type SupabaseServer } from "./supabase";

import { requireOperator } from "./_auth";
import {
  derivarCliente,
  derivarInvitacion,
  derivarPaseCliente,
  esPrimeraCompra,
  esRegistroOnlinePendiente,
  estadoInvitacion,
  shapeFicha,
  type ClienteDerivado,
  type FichaDerivada,
  type InvitacionDerivada,
  type PaseClienteDTO,
} from "./derive";
import { getCobro } from "./cobro";
import { getOperatorGym } from "./gym";
import { enviarInvitacion, type EnvioResult, type MailTransport } from "./invitaciones";
import { getPaquetes } from "./paquetes";
import { resolverIdentidad } from "./perfil";
import { EMAIL_EN_USO_MSG, EmailEnUsoError } from "./ventas";
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
  /** Contact email (not the connector) — carried so the Vender NUEVO soft
   *  duplicate warn can match a typed email against the loaded roster with no
   *  extra round trip. NEVER the claim_code (bearer credential, never in a DTO). */
  email: string | null;
  /** Derived invite state + es-MX badge for the picker (ADR-0015). */
  invitacion: InvitacionDerivada;
  /** True when the member has never had a sale (#77) — the Vender preselect /
   *  picker marks it PRIMERA COMPRA and the receipt snapshots it. Precomputed via
   *  the ventas_count_por_cliente RPC (a grouped DB-side count, run once per read
   *  in parallel with the roster select — never a per-row embed or fallback query). */
  primeraCompra: boolean;
}

/** Minimal roster for the venta client-picker, ordered by name. */
export const getClientesLite = cache(
  async (client?: SupabaseServer): Promise<ClienteLiteDTO[]> => {
    const supabase = client ?? (await createClient());
    // `.eq("gym_id", …)` on every staff read (spec 2026-07-13 §1.1): a scope
    // selector, not a boundary — RLS stays the boundary (ADR-0001); the eq flips
    // the correlated-SubPlan seq scan into an index condition and keeps a
    // multi-membership operator's roster to THIS gym.
    const gym = await getOperatorGym(supabase);
    const tz = gym.timezone;
    // Two independent reads instead of a correlated `ventas(count)` embed (which Postgres
    // evaluates once PER row of the 500-cliente roster): the roster select stays a plain
    // index scan, and ventas_count_por_cliente does the grouping DB-side in one pass.
    const [{ data }, { data: counts }] = await Promise.all([
      supabase
        .from("clientes")
        .select("id, nombre, tel, paquete_nombre, email, invitacion_enviada_at, auth_user_id")
        .eq("gym_id", gym.id)
        .order("nombre"),
      supabase.rpc("ventas_count_por_cliente", { p_gym_id: gym.id }),
    ]);

    if (!data) return [];

    const ventasPorCliente = new Map((counts ?? []).map((r) => [r.cliente_id, r.n]));

    return data.map((c) => ({
      id: c.id,
      nombre: c.nombre,
      tel: c.tel,
      inicial: iniciales(c.nombre),
      paqueteLabel: c.paquete_nombre ?? "Sin paquete",
      email: c.email,
      invitacion: derivarInvitacion(c, tz),
      primeraCompra: esPrimeraCompra(ventasPorCliente.get(c.id) ?? 0),
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
    const gym = await getOperatorGym(supabase); // resolved FIRST — the read is gym-scoped (§1.1)
    const { data } = await supabase
      .from("clientes")
      .select("id, nombre, tel, paquete_nombre, clases_restantes, vence")
      .eq("gym_id", gym.id)
      .order("nombre");

    if (!data) return [];

    const hoy = hoyEnZona(gym.timezone);
    return data.map((c) => derivarPaseCliente(c, hoy));
  },
);

function monthStartIso(hoy: Date): string {
  return toIsoDay(new Date(hoy.getFullYear(), hoy.getMonth(), 1));
}

/** The gym-local "HH:MM:SS" wall clock for a timestamptz — matches the Postgres
 *  `time` literal format asistencias.hora is stored in, so a venta's instant can be
 *  string-compared against it directly (C14, clases-gauge anchor). Seconds matter
 *  here (unlike @gym/format's `horaEnZona`, "HH:MM" for display): truncating to the
 *  minute would misclassify a check-in seconds apart from the venta on the same
 *  minute. */
function horaSegEnZona(isoTimestamp: string, tz: string): string {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: tz,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).format(new Date(isoTimestamp));
}

/** The ficha's rolling attendance window length, in days (ADR/spec 2026-06-01).
 *  One constant, easy to retune; the directory keeps its own this-month count. */
const FICHA_VENTANA_DIAS = 30;

/** A roster row plus its derived invite state and the online-pending flag the
 *  dashboard tile + roster filter share (ADR-0015). Extends the pure ClienteDerivado
 *  the directory already renders; the invite fields are attached at read. */
export interface ClienteRosterDTO extends ClienteDerivado {
  invitacion: InvitacionDerivada;
  /** Auth-linked (Door 2) member with no active package — the roster filter chip. */
  pendienteOnline: boolean;
}

/** Full roster, derived-at-read with this month's attendance count per client. */
export const getClientesRoster = cache(
  async (client?: SupabaseServer): Promise<ClienteRosterDTO[]> => {
    const supabase = client ?? (await createClient());
    const gym = await getOperatorGym(supabase);
    const tz = gym.timezone;
    const hoy = hoyEnZona(tz);

    // The roster genuinely needs every cliente row; the asistencias leg only feeds a
    // per-cliente count, so that leg is a grouped DB-side count (asistencias_mes_por_cliente)
    // instead of pulling the whole month's rows just to tally them in JS.
    const [clientesRes, countsRes] = await Promise.all([
      supabase
        .from("clientes")
        .select(
          "id, nombre, tel, paquete_nombre, clases_restantes, vence, email, invitacion_enviada_at, auth_user_id",
        )
        .eq("gym_id", gym.id)
        .order("nombre"),
      supabase.rpc("asistencias_mes_por_cliente", {
        p_gym_id: gym.id,
        p_desde: monthStartIso(hoy),
      }),
    ]);

    const clientes = clientesRes.data;
    if (!clientes) return [];

    const counts: Record<string, number> = {};
    for (const r of countsRes.data ?? []) counts[r.cliente_id] = r.n;

    return clientes.map((c) => {
      const base = derivarCliente(c, hoy, counts[c.id] ?? 0);
      const invitacion = derivarInvitacion(c, tz);
      return {
        ...base,
        invitacion,
        pendienteOnline: esRegistroOnlinePendiente(invitacion.estado, base.estado),
      };
    });
  },
);

/** The two roster headline counts (vigentes / totalActivos) for the dashboard,
 *  derived-at-read (ADR-0002). The full getClientesRoster is for the directory —
 *  it needs every cliente + asistEsteMes, so it fires a whole-month asistencias
 *  query. The dashboard never needs the client rows themselves for vigentes/
 *  totalActivos (two count-only queries, no `.order`) — only nuevosOnline still
 *  reads rows, and only the auth-linked subset (see getRosterResumen below). */
/** The roster headline counts plus `nuevosOnline` — the dashboard's "Nuevos
 *  registros online" tile: auth-linked (Door 2) members with no active package,
 *  the same population the roster filter chip surfaces (esRegistroOnlinePendiente). */
export interface RosterResumenDTO extends ResumenRoster {
  nuevosOnline: number;
}

/** `vigentes`/`totalActivos` restated as raw-column predicates (no client row fetch — see
 *  getRosterResumen). Both derive from derivarCliente + derivarEstado (derive.ts / domain
 *  rules.ts); this comment is the proof the two stay in lockstep with that pure logic, so a
 *  change there must be re-derived here too:
 *   - forfeit() only ever zeroes `clasesRest` when `diasRest < 0`, and derivarEstado already
 *     forces "sin_clases" whenever `diasRest < 0` regardless of clases — so forfeit never
 *     changes which estado a client lands in, and the predicates below can read the STORED
 *     `clases_restantes` directly.
 *   - totalActivos (estado !== "sin_clases"): tienePaquete AND diasRest >= 0 AND
 *     (clases_restantes IS NULL OR clases_restantes > 0). diasRest >= 0 ⟺ vence >= hoy.
 *   - vigentes (estado === "activo"): tienePaquete AND diasRest > 5 AND
 *     (clases_restantes IS NULL OR clases_restantes > 2). diasRest > 5 ⟺ vence >= hoy + 6d
 *     (both sides are whole-day midnights, so the comparison is exact — no fractional day). */
export const getRosterResumen = cache(
  async (client?: SupabaseServer): Promise<RosterResumenDTO> => {
    const supabase = client ?? (await createClient());
    const gym = await getOperatorGym(supabase);
    const hoy = hoyEnZona(gym.timezone);
    const hoyIso = toIsoDay(hoy);
    const vigenteDesdeIso = toIsoDay(addDays(hoy, 6));

    const [totalActivosRes, vigentesRes, onlineRes] = await Promise.all([
      supabase
        .from("clientes")
        .select("id", { count: "exact", head: true })
        .eq("gym_id", gym.id)
        .not("paquete_nombre", "is", null)
        .gte("vence", hoyIso)
        .or("clases_restantes.is.null,clases_restantes.gt.0"),
      supabase
        .from("clientes")
        .select("id", { count: "exact", head: true })
        .eq("gym_id", gym.id)
        .not("paquete_nombre", "is", null)
        .gte("vence", vigenteDesdeIso)
        .or("clases_restantes.is.null,clases_restantes.gt.2"),
      // nuevosOnline needs the full derivation (estadoInvitacion + derivarCliente), but only
      // over auth-linked rows — esRegistroOnlinePendiente is false for every other row, so
      // scoping the fetch to `auth_user_id is not null` drops the rest of the 500-cliente
      // roster without changing the count.
      supabase
        .from("clientes")
        .select(
          "id, nombre, tel, paquete_nombre, clases_restantes, vence, email, invitacion_enviada_at, auth_user_id",
        )
        .eq("gym_id", gym.id)
        .not("auth_user_id", "is", null),
    ]);

    const nuevosOnline = (onlineRes.data ?? []).filter((c) =>
      esRegistroOnlinePendiente(estadoInvitacion(c), derivarCliente(c, hoy, 0).estado),
    ).length;

    return {
      vigentes: vigentesRes.count ?? 0,
      totalActivos: totalActivosRes.count ?? 0,
      nuevosOnline,
    };
  },
);

/** Everything the ficha (client detail) renders: the pure derivation (FichaDerivada,
 *  shaped + tested in derive.ts) plus the I/O-sourced today + swipe neighbors. */
export type ClienteFichaDTO = FichaDerivada & {
  hoyIso: string;
  vecinos: Vecinos;
  /** Derived invite state + es-MX badge for the ficha header (ADR-0015). */
  invitacion: InvitacionDerivada;
  /** Contact email — the edit sheet's backfill field (S3, issue #71). Hidden/disabled once the row is
   *  claimed (`invitacion.estado === "cuenta_activa"`): the verified login email owns it then (D5). */
  email: string | null;
};

/** The ficha, derived-at-read (ADR-0002): a thin fetch that defers all shaping to
 *  the pure, tested shapeFicha; the wrapper owns only I/O + assembling hoyIso/vecinos. */
export const getClienteFicha = cache(
  async (id: string, client?: SupabaseServer): Promise<ClienteFichaDTO | null> => {
    const supabase = client ?? (await createClient());
    const gym = await getOperatorGym(supabase);
    const tz = gym.timezone;
    const hoy = hoyEnZona(tz);
    const hoyIso = toIsoDay(hoy);

    // Deliberate waterfall: await the cliente FIRST so a not-found id returns
    // early without firing the 5 downstream reads. Folding all 6 into one
    // Promise.all would waste 5 queries on every 404; one extra round trip on
    // the happy path is the accepted cost.
    const { data: c } = await supabase
      .from("clientes")
      .select(
        "id, nombre, tel, paquete_nombre, clases_restantes, vence, created_at, email, invitacion_enviada_at, auth_user_id",
      )
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
          .select("fecha, created_at, paquete_nombre, monto, metodo, clases, vigencia_tipo, vigencia_dias")
          .eq("cliente_id", id)
          // The saldo anchor is the LAST-WRITTEN sale (created_at desc, id desc — never
          // fecha, which a backdate can push into the past), matching mi_membresia (spec
          // §D3/C1). `fecha` still drives the DISPLAY (compradoDisplay / días-gauge anchor).
          .order("created_at", { ascending: false })
          .order("id", { ascending: false }),
        getVecinos(id, supabase),
        supabase.from("perfil").select("negocio").eq("gym_id", gym.id).maybeSingle(),
        listarPlantillas(supabase),
        getPaquetes(supabase, tz).catch(() => []),
        getCobro(supabase).catch(() => null),
      ]);

    const negocio = resolverIdentidad(
      {
        negocio: perfilRes.data?.negocio ?? null,
        coach: null,
        ciudad: null,
      },
      gym.brandName,
    ).negocio;

    // Classes consumed since the last purchase (Part B clases-gauge denominator):
    // count `consumio` rows at/after the anchor sale's WRITE INSTANT (created_at, not
    // fecha — C2/C14), not just its calendar day. A check-in earlier the same day as a
    // renewal was already spent from the pre-renewal balance, so day-granularity
    // double-counts it; and a backdated fecha would wrongly re-count gap visits that
    // already decremented the balance live. ventaDia is the gym-local calendar day;
    // ventaHora is the gym-local "HH:MM:SS" wall clock, directly string-comparable
    // against asistencias.hora (a Postgres `time`). Null `hora` (back-entry rows,
    // predating the column) are counted: no recorded time can prove they preceded it.
    const ventas = ventasRes.data ?? [];
    const ventaInstante = ventas[0]
      ? { dia: toIsoDay(fechaEnZona(ventas[0].created_at, tz)), hora: horaSegEnZona(ventas[0].created_at, tz) }
      : null;
    let attendedSincePurchase = 0;
    if (ventaInstante) {
      const { dia: ventaDia, hora: ventaHora } = ventaInstante;
      if (ventaDia >= ventanaIso) {
        // Common case: the purchase is inside the 30-day window we already fetched,
        // so count the rows in hand — no extra round trip.
        attendedSincePurchase = (asistRes.data ?? []).filter(
          (a) =>
            a.consumio &&
            (a.fecha > ventaDia ||
              (a.fecha === ventaDia && (a.hora === null || a.hora >= ventaHora))),
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
          .or(`fecha.gt.${ventaDia},and(fecha.eq.${ventaDia},or(hora.gte.${ventaHora},hora.is.null))`);
        attendedSincePurchase = count ?? 0;
      }
    }

    const ficha = shapeFicha(
      c,
      asistRes.data ?? [],
      ventas,
      hoy,
      hoyIso,
      tz,
      plantillas,
      negocio,
      attendedSincePurchase,
      { precios: fmtPrecios(paquetes), datos_pago: fmtDatosPago(cobro) },
    );

    return { ...ficha, hoyIso, vecinos, invitacion: derivarInvitacion(c, tz), email: c.email };
  },
);

/** Identity-edit input (nombre + tel + optional email). Trims like crearVenta; tel validity is the
 *  canonical 10-digit MX rule (isTelValido), the same rule the DB CHECK (clientes_tel_10_digits_ck)
 *  enforces. `email` is OPTIONAL and `.email()`-VALIDATED (design §4) — unlike the sale-path `email` field
 *  (crearVentaSchema in ventas.ts, deliberately unvalidated: cash sale never gated), this surface is an edit, not a
 *  sale, so validation is safe here. Blank/whitespace-only input means "no change" (preprocessed to
 *  `undefined`, never forwarded as `''`) — this slice has no explicit "clear the email" arm. */
export const actualizarClienteSchema = z.object({
  clienteId: z.string().uuid(),
  nombre: z.string().trim().min(3),
  tel: z.string().trim().refine(isTelValido, { message: "Teléfono inválido" }),
  email: z.preprocess(
    (v) => (typeof v === "string" && v.trim() === "" ? undefined : v),
    z.string().trim().email("Correo inválido").optional(),
  ),
});

export type ActualizarClienteInput = z.infer<typeof actualizarClienteSchema>;

/** `actualizarCliente`'s result: the auto-invite outcome (ADR-0015 §3 backfill path — issue #71). `null`
 *  when no email arm was sent, the email was unchanged, or the row is already claimed; a value otherwise,
 *  mirroring `enviarInvitacion`'s own best-effort contract (never thrown, always surfaced). */
export interface ActualizarClienteResult {
  invite: EnvioResult | null;
}

/** Edit a client's identity (nombre + tel + optional email backfill). Injectable client (ADR-0001).
 *  The actualizar_cliente RPC re-checks auth.uid(), RLS scopes the UPDATE to the owner (SECURITY INVOKER),
 *  and — in the SAME round trip — reports whether the email was newly set/changed AND whether the row was
 *  unclaimed at write time; only that combination fires the auto-invite (a claimed row's email is guarded
 *  server-side too, defense in depth). `opts.transport` is the same injectable mail-transport seam
 *  `enviarInvitacion` exposes (ADR-0001) — its test double is this function's second consumer. */
export async function actualizarCliente(
  raw: unknown,
  client?: SupabaseServer,
  opts: { transport?: MailTransport } = {},
): Promise<ActualizarClienteResult> {
  const input = actualizarClienteSchema.parse(raw);
  const supabase = client ?? (await createClient());

  await requireOperator(supabase);

  const { data, error } = await supabase
    .rpc("actualizar_cliente", {
      p_cliente_id: input.clienteId,
      p_nombre: input.nombre,
      p_tel: input.tel,
      ...(input.email ? { p_email: input.email } : {}),
    })
    .single();
  // The email backfill can collide with clientes_email_gym_uq (another row in the gym holds it) — the
  // RPC raises the EMAIL_EN_USO_MSG string (mirrors the vender path), so surface it typed for the ficha.
  if (error?.message === EMAIL_EN_USO_MSG) throw new EmailEnUsoError();
  if (error || !data) throw new Error("No se pudo actualizar el cliente");

  const invite =
    data.email_changed && data.unclaimed
      ? await enviarInvitacion(
          { clienteId: input.clienteId },
          { transport: opts.transport, client: supabase },
        )
      : null;

  return { invite };
}

/** Re-send the SAME invite code from the ficha (design §3 REENVIAR — issue #71). A thin named alias over
 *  `enviarInvitacion` (no new logic — the RPC chain already IS the re-send: `preparar_invitacion` reuses
 *  the existing code when one is set): the ficha's REENVIAR button and "enviar invitación" (sin_invitar)
 *  both call this. `opts.transport` mirrors `enviarInvitacion`'s injectable seam. */
export async function reenviarInvitacion(
  clienteId: string,
  client?: SupabaseServer,
  opts: { transport?: MailTransport } = {},
): Promise<EnvioResult> {
  const supabase = client ?? (await createClient());
  await requireOperator(supabase);
  return enviarInvitacion({ clienteId }, { transport: opts.transport, client: supabase });
}
