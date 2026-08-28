// Pure cliente derivation (ADR-0002). Given a client's STORED facts + the read's
// contexto (hoy + the gym's pase-suelto catalog) + this month's attendance count,
// produce the row a screen renders: the display fields plus the ONE lifecycle
// `veredicto` (@gym/domain/lifecycle). No I/O, no Supabase — unit-tested in
// derive.test.ts. The DAL fetches rows and the aggregates, then maps each through
// here; this is the SINGLE adapter both roster reads, the ficha, the pase de lista
// and the respaldo share, so none of them can assemble the engine's input its own
// way (the ficha and the export each got the pase-suelto blind wrong that way).

import { derivarVeredicto, type ContextoVeredicto, type HechosCliente, type VeredictoCliente } from "@gym/domain/lifecycle";
import { diasRestantes } from "@gym/domain/rules";
import type { PlantillaContext } from "@gym/domain/types";
import { DOW, fechaEnZona, firstName, fmtShort, horaEnZona, iniciales, MONTHS_FULL, parseDay, pesos, toIsoDay } from "@gym/format";

import { fmtClases, fmtDias, renderMensajes } from "./plantilla-ctx";
import type { MensajeDTO, PlantillaDTO } from "./plantillas";

/** One `clientes` row's stored facts, DB-column-spelled. `auth_user_id` is the
 *  auth link (Door 2) — never the `claim_code`, a single-use bearer credential
 *  that must never reach a DTO. */
export interface ClienteFacts {
  id: string;
  nombre: string;
  tel: string | null;
  paquete_nombre: string | null;
  clases_restantes: number | null; // NULL = ilimitado
  vence: string | null; // 'YYYY-MM-DD'
  auth_user_id: string | null;
}

/** A roster row ready to render: the display strings this layer formats, plus the
 *  domain's whole `veredicto` for the row. There is no flat `estado`/`diasRest`/
 *  `clasesRest` beside it — a second copy of a derived fact is a second place for
 *  a surface to disagree, which is exactly what the ficha and the export did. */
export interface ClienteDerivado {
  id: string;
  nombre: string;
  tel: string | null;
  inicial: string;
  paquete: string;
  venceDisplay: string; // "16 jun" or "—"
  clasesRestLabel: string; // "∞" / "5" / "0"
  asistEsteMes: number;
  veredicto: VeredictoCliente;
}

/**
 * Shape one cliente row. `visitas` is the caller's HONEST statement about the
 * visit aggregate (#226): the two roster reads pass the real last-visit facts,
 * the ficha / pase de lista / respaldo pass `"no_leidas"` and get
 * `veredicto.ausencia === null` — never a fabricated "never absent".
 */
export function derivarCliente(
  c: ClienteFacts,
  ctx: ContextoVeredicto,
  asistEsteMes: number,
  visitas: HechosCliente["visitas"],
): ClienteDerivado {
  const veredicto = derivarVeredicto(
    {
      paquete_nombre: c.paquete_nombre,
      clases_restantes: c.clases_restantes,
      vence: c.vence,
      tieneCuenta: c.auth_user_id !== null,
      visitas,
    },
    ctx,
  );

  // The DISPLAY date reads the stored column, not `veredicto.vence` (which is
  // gated to null for a package-less row): a row with a date and no package name
  // still shows the date it has, while its estado correctly says sin_paquete.
  const venceDate = c.vence ? parseDay(c.vence) : null;

  return {
    id: c.id,
    nombre: c.nombre,
    tel: c.tel,
    inicial: iniciales(c.nombre),
    paquete: c.paquete_nombre ?? "Sin paquete",
    venceDisplay: venceDate ? fmtShort(venceDate) : "—",
    clasesRestLabel: veredicto.clases === "ilimitado" ? "∞" : String(veredicto.clases),
    asistEsteMes,
    veredicto,
  };
}

export interface PaseClienteDTO {
  id: string;
  nombre: string;
  inicial: string;
  paquete: string;
  /** Remaining-classes label, e.g. "Ilimitado", "5 clases", "Sin paquete". */
  clasesLabel: string;
  diasRest: number;
  /** Active package due for renewal — the veredicto's own `porRenovar`, the SAME
   *  single-row POR RENOVAR gate the roster/INICIO tile and the directory's
   *  filter/count read (#225 F4): días <= RENOVACION_DIAS OR clases <=
   *  RENOVACION_CLASES (paseSuelto-exempt), gated on the package still being live.
   *  Never a hand-inlined day threshold, and never the retired por_vencer estado
   *  value. */
  porRenovar: boolean;
}

/**
 * The pase de lista's slim per-client projection. Derives through derivarCliente,
 * so `porRenovar` IS the roster/INICIO tile's own verdict — the pase shares the one
 * definition of "due for renewal" instead of re-coining a `<= 5`. `ctx.pasesSueltos`
 * (#225 F2) is the gym's package catalog, so a spent one-off pass is correctly
 * exempted from the clases arm here too, not just on the roster/dashboard/export.
 */
export function derivarPaseCliente(c: ClienteFacts, ctx: ContextoVeredicto): PaseClienteDTO {
  const d = derivarCliente(c, ctx, 0, "no_leidas");
  const clasesLabel = !c.paquete_nombre
    ? "Sin paquete"
    : c.clases_restantes === null
      ? "Ilimitado"
      : `${c.clases_restantes} clase${c.clases_restantes === 1 ? "" : "s"}`;
  return {
    id: d.id,
    nombre: d.nombre,
    inicial: d.inicial,
    paquete: d.paquete,
    clasesLabel,
    // A package-less row has no countdown; the desk renders the 0 it always did.
    diasRest: d.veredicto.dias ?? 0,
    porRenovar: d.veredicto.porRenovar,
  };
}

// ── Invite lifecycle (derived, NEVER stored) ───────────────────────
// The invite state machine (ADR-0015, CONTEXT 'estados de invitación'): derived at
// read from email / invitacion_enviada_at / auth_user_id — never a stored enum. One
// home for the derivation; the roster, Vender picker, and ficha all badge it. NOTE
// `claim_code` is deliberately NOT a fact here — it is a single-use bearer credential
// that must never reach a DTO/prop, so the derivation reads only these three columns.

export type EstadoInvitacion =
  | "sin_email" // email NULL — no way to invite yet
  | "sin_invitar" // email set, invite not yet sent (rare/transient)
  | "invitacion_enviada" // invite sent (carries the fecha)
  | "cuenta_activa"; // auth_user_id sealed — the member has app access

/** The three stored facts the invite state derives from (never `claim_code`). */
export interface InvitacionFacts {
  email: string | null;
  invitacion_enviada_at: string | null; // timestamptz
  auth_user_id: string | null;
}

export interface InvitacionDerivada {
  estado: EstadoInvitacion;
  /** es-MX badge label; the 'Invitada {fecha}' arm is gym-local (tz). */
  badge: string;
}

/** Pure invite-state machine. Precedence: a claimed account (`auth_user_id`) is
 *  `cuenta_activa` regardless of the invite fields; else no email → `sin_email`;
 *  else emailed-but-unsent → `sin_invitar`; else `invitacion_enviada`. */
export function estadoInvitacion(f: InvitacionFacts): EstadoInvitacion {
  if (f.auth_user_id !== null) return "cuenta_activa";
  if (f.email === null) return "sin_email";
  if (f.invitacion_enviada_at === null) return "sin_invitar";
  return "invitacion_enviada";
}

const BADGE_INVITACION: Record<EstadoInvitacion, string> = {
  sin_email: "Sin email",
  sin_invitar: "Sin invitar",
  invitacion_enviada: "Invitada", // + fecha appended below
  cuenta_activa: "Cuenta activa",
};

/** Derive the invite state + its es-MX badge. `tz` renders the 'Invitada {fecha}'
 *  date arm gym-local (audit finding 1), like every other timestamptz→day here. */
export function derivarInvitacion(f: InvitacionFacts, tz: string): InvitacionDerivada {
  const estado = estadoInvitacion(f);
  const badge =
    estado === "invitacion_enviada" && f.invitacion_enviada_at
      ? `Invitada ${fmtShort(fechaEnZona(f.invitacion_enviada_at, tz))}`
      : BADGE_INVITACION[estado];
  return { estado, badge };
}

/** Primera compra: the member has never had a sale, regardless of door (#77). */
export function esPrimeraCompra(ventasCount: number): boolean {
  return ventasCount === 0;
}

// ── Ficha (client detail) derivation ───────────────────────────────
// The ficha's pure read-shaping, lifted out of the DAL's cache() closure so it
// is testable through its interface (the closure was the single largest impure
// derivation in the tree, with zero coverage). The DAL fetches the rows + the
// recordatorio body + negocio, then delegates here — mirrors resumen.ts →
// calcularResumenMes and clientes.ts → derivarPaseCliente. ADR-0002.

function metodoLabel(m: string): string {
  return m.charAt(0).toUpperCase() + m.slice(1);
}

// ── Saldo-gauge math (pure, unit-tested) ───────────────────────────
// The ficha's saldo bars are depletion gauges anchored to the last purchase:
// "full" at the moment they last bought, draining until the next purchase. The
// .tsx only renders the fill ratio + caption — all the math lives here.

/** Gauge fill ratio, clamped to [0, 1]. A non-positive denominator (no anchor /
 *  divide-by-zero) yields 0 — an empty bar — never NaN, Infinity, or a ratio > 1. */
export function gaugeFill(remaining: number, denom: number): number {
  if (denom <= 0) return 0;
  return Math.min(1, Math.max(0, remaining / denom));
}

/** Días-bar denominator: the full validity window granted at the last purchase =
 *  days from that purchase to `vence` (drains by calendar time). */
export function diasDenom(vence: Date, lastPurchaseDate: Date): number {
  return diasRestantes(vence, lastPurchaseDate);
}

// ── D0 · the unified "cargable" counting rule (slice 2 spec §D0) ────
// The ONE definition of "this event charged a class", shared by the ficha's saldo
// derivation and (in SQL) by mi_membresia + editar_venta. Two legs that never
// double-count the same charge:
//   · asistencia leg — a mark that is not perdonada and does NOT link to a
//     reservation that already charged at booking (`consumio = true`). That last
//     clause defers booking-charged check-ins to the reservation leg. Note the leg
//     counts `consumio = false` rows too (attended while ilimitado): as-if-original
//     means "would have charged under the corrected terms".
//   · reservation leg — a hold that charged (`consumio = true`) and was not
//     cancelled. `cancel_class_session` refunds and stamps 'cancelada' while leaving
//     `consumio` stale, so the status filter is what keeps a gym-cancelled class out.

/** The go-live instant of the 2026-08-27 `registrar_venta` reset fix (the sales-outage
 *  close-out). Every anchor sale written BEFORE it carries a stacked-era balance BY
 *  CONSTRUCTION, so a derived-vs-stored gap on those is expected, not evidence — noting it
 *  roster-wide would be crying wolf. The discrepancy note is therefore scoped to anchors
 *  created at/after this instant (spec §D1). */
export const RESET_EPOCH = "2026-08-27T15:30:00.000Z";

/** A gym-local charge moment: the calendar day plus the wall clock, SECONDS included — a
 *  check-in seconds after a renewal belongs to the new pack, and truncating to the minute
 *  would misfile it. `hora === null` is the backdated desk mark (`fijar_asistencia` writes
 *  `hora = null` for any day but today, an ongoing stream): date granularity, §D0. */
export interface MomentoCargo {
  dia: string; // 'YYYY-MM-DD'
  hora: string | null; // 'HH:MM:SS'
}

/** A timestamptz → its gym-local `{ dia, hora }`. ONE home for the conversion: the ficha's
 *  attribution, the DAL's old-anchor fallback filter and (mirrored) the SQL helper all read
 *  the same moment, so a naive `::date`-style off-by-one after 18:00 local can't creep into
 *  one of them alone (§D0). */
export function momentoEnZona(isoTimestamp: string, tz: string): { dia: string; hora: string } {
  return {
    dia: toIsoDay(fechaEnZona(isoTimestamp, tz)),
    hora: new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).format(new Date(isoTimestamp)),
  };
}

/** A venta reduced to its attribution key — the gym-local moment it was WRITTEN
 *  (`created_at`; a backdated `fecha` never moves it, §D0 "no backdate re-attribution"). */
export interface AnclaVenta {
  id: string;
  dia: string;
  hora: string;
}

/** Build the attribution keys from the DAL's ventas list. Order is preserved, so the caller's
 *  `created_at desc` ordering IS the "latest venta first" the lookup below walks. */
export function anclasVenta(ventasDesc: FichaVentaRow[], tz: string): AnclaVenta[] {
  return ventasDesc.map((v) => ({ id: v.id, ...momentoEnZona(v.created_at, tz) }));
}

/** §D0 attribution: an event belongs to the LATEST venta whose write instant is ≤ its charge
 *  moment. A null-hora event falls back to DATE granularity, and a same-day tie goes to the
 *  NEWER venta (`ventasDesc` is newest-first, so the first match is that venta) — matching the
 *  DAL's own null-hora fallback, which counts an untimed same-day mark in. `null` = the event
 *  predates every sale. */
export function ventaAtribuida(ventasDesc: AnclaVenta[], ev: MomentoCargo): string | null {
  for (const v of ventasDesc) {
    const anterior =
      ev.hora === null ? v.dia <= ev.dia : v.dia < ev.dia || (v.dia === ev.dia && v.hora <= ev.hora);
    if (anterior) return v.id;
  }
  return null;
}

/** §D0 asistencia leg. `deleted_at is null` is the fetch's job (the DAL never reads soft-deleted
 *  rows); `reservasCobradas` is the id set of reservations that charged at booking. */
export function esCargableAsistencia(
  a: { perdonada: boolean; reservation_id: string | null },
  reservasCobradas: ReadonlySet<string>,
): boolean {
  if (a.perdonada) return false;
  return a.reservation_id === null || !reservasCobradas.has(a.reservation_id);
}

/** §D0 reservation leg: the hold charged and was not cancelled. */
export function esCargableReserva(r: { consumio: boolean; status: string }): boolean {
  return r.consumio && r.status !== "cancelada";
}

/** A class session's END instant, in epoch ms. `class_session` has NO `ends_at` column
 *  (verified against the generated schema types) — the end is `starts_at + duration_min`.
 *  This is the noShow/apartada boundary: in-progress is still an apartada (§D1). */
export function finSesion(s: { starts_at: string; duration_min: number }): number {
  return new Date(s.starts_at).getTime() + s.duration_min * 60_000;
}

export interface FichaAsistencia {
  dDisplay: string;
  hora: string | null;
  today: boolean;
  /** The CLASS this visit belongs to — "METCON 19:45" (name + the class's own hour,
   *  #178) — or null for a class-less visit, which the leaf labels (it also has to
   *  label the libre row it holds in local state after a toggle, so that copy lives
   *  there, once). `hora` above stays the ARRIVAL stamp and keeps its own column: two
   *  visits 17 seconds apart both read 23:11 there, and only this tells them apart. */
  clase: string | null;
  /** The visit's stated PROVENANCE (#89) for the `clase === null` case — 'libre' is a
   *  real ACCESO LIBRE visit; null means the row predates #89 and never stamped one, so
   *  the leaf must render "—", never assert ACCESO LIBRE for a visit that may well have
   *  been an unrecorded class (#178: at forge, 189 of 206 pre-#89 class-less rows were). */
  origen: "libre" | "clase" | null;
  /** The historial row's KIND (§D4). `"visita"` is an asistencia row — every row the list
   *  used to hold. `"no_asistio"` is the new line: a booking that CHARGED a class and whose
   *  session ended with no check-in ("No asistió — cargada"). It has no asistencia behind it,
   *  so nothing on this screen can toggle or undo it, and `no_show` stays DERIVED — this row
   *  is display only, never a status write (reservation-truthfulness ruling). */
  tipo: "visita" | "no_asistio";
  /** The charge behind this row was attributed to a venta OLDER than the current anchor, so
   *  the leaf tags it `(paquete anterior)` (§D4) — this is what closes the "why does it say 1
   *  used" seam for a mark made hours before a renewal was registered. `false` on a row that
   *  charged nothing at all (perdonada / already counted on the other leg). */
  paqueteAnterior: boolean;
}
export interface FichaPago {
  /** The `ventas.id` this row corrects/deletes (#269) — never rendered, only threaded to the
   *  edit/delete write seam. */
  id: string;
  /** The sale's receipt number — the sheet renders it `F-{folio}`, the same spelling the
   *  recibo and the ticket-twin email print (#269), so the operator can match a paper ticket. */
  folio: number;
  fechaDisplay: string;
  paquete: string;
  montoDisplay: string;
  /** Display label ("Efectivo") — RENAMED from the old bare `metodo` (#269) now that a raw
   *  `metodo` value lives alongside it; the ficha's HISTORIAL DE PAGOS rows read this one. */
  metodoDisplay: string;
  /** Raw stored facts the correction sheet edits/previews from — never rendered directly. */
  monto: number;
  metodo: "efectivo" | "transferencia" | "tarjeta";
  fecha: string;
  /** `fecha` as a gym-tz ISO day ("YYYY-MM-DD") — what the correction sheet's date picker seeds
   *  from and compares against, since the raw `fecha` instant can't be compared to `hoyIso`
   *  without re-deriving the zone at the leaf. */
  fechaIso: string;
  clases: number | null;
  vigenciaTipo: "dias" | "mes";
  vigenciaDias: number | null;
  createdAt: string;
  /** Spanish lowercase month name of `fecha`, gym-local (e.g. "agosto") — feeds the delete
   *  confirm's "Se restarán $M de los ingresos de {mes}" copy (#267 rule 6). */
  mes: string;
}

/** A cliente row with its alta timestamp — the ficha's stored facts. */
export interface FichaClienteRow extends ClienteFacts {
  created_at: string;
}
/** Asistencia rows the ficha renders (absolute date + check-in time). The window
 *  is the rolling last 30 days, widened back to the last purchase when older, so
 *  the same rows feed both the historial and `attendedSincePurchase` (#173: every
 *  visit — `deleted_at is null and not perdonada` — not just `consumio` ones). */
export interface FichaAsistRow {
  fecha: string;
  hora: string | null;
  consumio: boolean;
  /** Marks the second record of one cooldown-paired arrival (#173) — never a real second
   *  visit. Excluded from `attendedSincePurchase` (`deleted_at is null and not perdonada`,
   *  see the class doc above); carried on the type because that filter runs on these rows. */
  perdonada: boolean;
  /** The visit's CONTEXT (#89): a class, or null for ACCESO LIBRE. */
  class_session_id: string | null;
  /** The visit's stated PROVENANCE (#89): 'libre' | 'clase' | null (row predates #89 —
   *  provenance unknown, #178). Threaded through to `FichaAsistencia.origen` so the ficha's
   *  historial never asserts ACCESO LIBRE for a class-less row it cannot actually attest. */
  origen: "libre" | "clase" | null;
  /** The booking this mark checked in against (§D0) — the join that keeps a booking-charged
   *  check-in from being counted twice (once here, once on the reservation leg) and that
   *  proves a charged hold WAS attended. */
  reservation_id: string | null;
  /** The class itself, embedded on the same read (#178) — null on an ACCESO LIBRE row.
   *  Deliberately NOT filtered on `cancelled_at`: cancelling a session afterwards does
   *  not un-attend it, and dropping the embed would blank a real visit's label. */
  class_session: {
    starts_at: string;
    is_special: boolean;
    special_name: string | null;
    class_type: { name: string } | null;
  } | null;
}

/** A class visit's label: the class NAME plus the class's own scheduled HOUR, gym-local
 *  ("METCON 19:45") — the two facts that tell two class visits on one day apart. Name
 *  ladder, mirroring the agenda's `topTag`: a clase especial's own name, else the
 *  catalog class_type name, else the bare "Clase" (a session the read could not
 *  resolve, or an especial saved with a blank name — the row IS a class visit, so
 *  calling it ACCESO LIBRE would be a lie). */
export function etiquetaClase(s: FichaAsistRow["class_session"], tz: string): string {
  if (!s) return "Clase";
  const nombre = (s.is_special && s.special_name?.trim()) || s.class_type?.name || "Clase";
  return `${nombre} ${horaEnZona(new Date(s.starts_at), tz)}`;
}
/** A venta row reduced to what the ficha's pagos list + saldo gauges need. `id` + `created_at`
 *  (#269) exist only to thread through to `FichaPago` for the correction sheet — the gauge math
 *  above never reads them. */
export interface FichaVentaRow {
  id: string;
  folio: number;
  fecha: string;
  created_at: string;
  paquete_nombre: string;
  monto: number;
  metodo: string;
  clases: number | null;
  vigencia_tipo: string;
  vigencia_dias: number | null;
}

/** A reservation row the saldo derivation reads (§D1's new fetch). `reservation.member_id`
 *  joins `clientes.id`; the embedded session carries the two columns the noShow/apartada
 *  boundary needs (`starts_at` + `duration_min` — there is no `ends_at`) plus the same name
 *  ladder `etiquetaClase` walks, so a "No asistió — cargada" line names its class. */
export interface FichaReservaRow {
  id: string;
  created_at: string;
  consumio: boolean;
  status: string;
  class_session_id: string;
  class_session: {
    starts_at: string;
    duration_min: number;
    is_special: boolean;
    special_name: string | null;
    class_type: { name: string } | null;
  } | null;
}

/** A saldo depletion gauge: the fill ratio (0–1) the bar renders, plus the caption's two
 *  HONEST counts (§D2). The días caption is `venceDisplay`.
 *
 *  `total` is the anchor sale's GRANT (`ventas.clases`) — not the old `restantes + usadas`,
 *  which was self-fulfilling: it absorbed every drift, so a stacked or hand-edited balance
 *  always painted a plausible bar. `usadas` moved with it, from the #173 VISIT count to the
 *  §D0 CHARGE count, so the caption states what was actually debited from this pack. */
export interface ClasesGauge {
  fill: number;
  usadas: number;
  /** Holds that already charged but whose class has not ended yet — the caption's
   *  "· Apartadas N" arm, omitted by the leaf when 0. */
  apartadas: number;
  total: number;
}
export interface DiasGauge {
  fill: number;
}

/** The anchor sale a balance is explained against — the LAST-WRITTEN venta (`ventas[0]`,
 *  created_at desc). `grant` is `ventas.clases`; null = an ilimitado pack, which has no
 *  gauge and no derivable balance. */
export interface SaldoAncla {
  ventaId: string;
  folio: number;
  grant: number | null;
  createdAt: string;
  fecha: string;
}

/** The ficha's balance, EXPLAINED from events (§D1). The stored counter stays the operational
 *  source — this is the derivation that says where it should be, so the two can be compared out
 *  loud instead of the gauge quietly denominating on whatever the counter happens to hold. */
export interface SaldoDetalle {
  anchor: SaldoAncla | null;
  /** §D0 charge events attributed to the anchor whose mark/session is already in the past. */
  usadas: number;
  /** The subset of `usadas` that came from the reservation leg with no check-in behind it and
   *  a session that has ENDED — the "No asistió — cargada" lines. */
  noShows: number;
  /** Reservation-leg charges whose session has not ended yet (in-progress counts here). */
  apartadas: number;
  /** RAW stored `clientes.clases_restantes` — never the read-time forfeited number. The
   *  invariant has to run on what the DB actually holds. null = ilimitado. */
  restantes: number | null;
  /** grant − usadas − apartadas. null when the anchor is ilimitado (nothing to derive). */
  derived: number | null;
  /** derived − restantes. Zero on a healthy member; nonzero means the stored counter and the
   *  event history disagree. null when either side is null. */
  discrepancia: number | null;
  /** Whether the ficha may SHOW that gap (§D1): only a nonzero `discrepancia` on an anchor
   *  written at/after `RESET_EPOCH`. Every pre-epoch anchor carries a stacked-era balance by
   *  construction, so flagging those would be crying wolf. */
  mostrarDiscrepancia: boolean;
}

/** Everything the saldo derivation needs beyond the rows the ficha already reads. Passed as one
 *  object rather than three more positionals — and it REPLACES the old `attendedSincePurchase`
 *  count, whose fetch machinery the DAL now repurposes for the §D0 charge count (§D2). */
export interface EntradaSaldo {
  /** Bookings covering the anchor window — see `FichaReservaRow`. */
  reservas: FichaReservaRow[];
  /** The DAL's EXACT asistencia-leg charge count when the fetched 30-day asistencia window does
   *  not reach back to the anchor (the old-anchor head-count path). `null` = the rows in hand
   *  already cover the anchor, so count them here. */
  cargadasFueraDeVentana: number | null;
  /** The read's instant — the noShow/apartada boundary. Passed in (never `Date.now()` in here)
   *  for the same reason `ctx.hoy` is: this module stays pure. */
  ahora: Date;
}

const SALDO_VACIO: EntradaSaldo = { reservas: [], cargadasFueraDeVentana: null, ahora: new Date(0) };

/**
 * Explain a balance from events (§D0 + §D1). PURE. `ventas` is ordered created_at DESC (the
 * DAL's order), so `ventas[0]` is the anchor. Both legs are attributed with the SAME
 * `ventaAtribuida` rule, so an event can only ever land on one venta.
 *
 * A no-show is claimed only when BOTH signals agree the member never showed: the reservation is
 * not `'asistida'` (both check-in RPCs stamp that) AND no asistencia in hand links back to it.
 * The status leg is what keeps the claim honest when the session predates the fetched asistencia
 * window — an attended-but-out-of-window booking would otherwise read as a no-show.
 */
export function saldoDetalle(
  clasesRestantes: number | null,
  ventas: FichaVentaRow[],
  asistencias: FichaAsistRow[],
  tz: string,
  entrada: EntradaSaldo,
): SaldoDetalle {
  const latest = ventas[0];
  const anchor: SaldoAncla | null = latest
    ? {
        ventaId: latest.id,
        folio: latest.folio,
        grant: latest.clases,
        createdAt: latest.created_at,
        fecha: latest.fecha,
      }
    : null;
  const base: SaldoDetalle = {
    anchor,
    usadas: 0,
    noShows: 0,
    apartadas: 0,
    restantes: clasesRestantes,
    derived: null,
    discrepancia: null,
    mostrarDiscrepancia: false,
  };
  if (!anchor) return base;

  const anclas = anclasVenta(ventas, tz);
  const cobradas = reservasCobradas(entrada.reservas);

  const usadasAsistencia =
    entrada.cargadasFueraDeVentana ??
    asistencias.filter(
      (a) =>
        esCargableAsistencia(a, cobradas) &&
        ventaAtribuida(anclas, { dia: a.fecha, hora: a.hora }) === anchor.ventaId,
    ).length;

  let usadasReserva = 0;
  let apartadas = 0;
  for (const r of entrada.reservas) {
    if (!cargoDelAncla(r, anclas, anchor.ventaId, tz)) continue;
    if (sesionTerminada(r, entrada.ahora)) usadasReserva += 1;
    else apartadas += 1;
  }
  const noShows = reservasNoAsistidas(entrada.reservas, asistencias, anclas, anchor.ventaId, tz, entrada.ahora)
    .length;

  const usadas = usadasAsistencia + usadasReserva;
  const derived = anchor.grant === null ? null : anchor.grant - usadas - apartadas;
  const discrepancia = derived === null || clasesRestantes === null ? null : derived - clasesRestantes;
  return {
    anchor,
    usadas,
    noShows,
    apartadas,
    restantes: clasesRestantes,
    derived,
    discrepancia,
    mostrarDiscrepancia:
      discrepancia !== null &&
      discrepancia !== 0 &&
      new Date(anchor.createdAt).getTime() >= Date.parse(RESET_EPOCH),
  };
}

/** The id set of bookings that charged at booking time — the asistencia leg's dedupe key. */
function reservasCobradas(reservas: FichaReservaRow[]): Set<string> {
  return new Set(reservas.filter((r) => r.consumio).map((r) => r.id));
}

/** A charged, non-cancelled booking whose charge landed on THIS anchor. */
function cargoDelAncla(r: FichaReservaRow, anclas: AnclaVenta[], anchorId: string, tz: string): boolean {
  return esCargableReserva(r) && ventaAtribuida(anclas, momentoEnZona(r.created_at, tz)) === anchorId;
}

/** Has the class already ended? A hold whose session row is missing cannot be proven still
 *  pending, so it counts as spent rather than as an apartada that never resolves. */
function sesionTerminada(r: FichaReservaRow, ahora: Date): boolean {
  return r.class_session ? finSesion(r.class_session) <= ahora.getTime() : true;
}

/**
 * The charged bookings attributed to `anchorId` whose class ENDED with nothing to show for it —
 * the §D1 noShow set. ONE definition, read both by `saldoDetalle`'s count and by the
 * "No asistió — cargada" historial lines, so the number and the rows can never disagree.
 *
 * A no-show is claimed only when BOTH signals agree: the reservation is not `'asistida'` (every
 * check-in path — `pasar_lista_sesion`, `fijar_asistencia` — stamps that status) AND no
 * asistencia in hand links back to it. The status leg is what keeps the claim honest for a
 * session older than the fetched asistencia window, where the linked mark simply isn't in hand.
 */
export function reservasNoAsistidas(
  reservas: FichaReservaRow[],
  asistencias: FichaAsistRow[],
  anclas: AnclaVenta[],
  anchorId: string | null,
  tz: string,
  ahora: Date,
): FichaReservaRow[] {
  if (anchorId === null) return [];
  const conAsistencia = new Set(
    asistencias.map((a) => a.reservation_id).filter((r): r is string => r !== null),
  );
  return reservas.filter(
    (r) =>
      cargoDelAncla(r, anclas, anchorId, tz) &&
      sesionTerminada(r, ahora) &&
      r.status !== "asistida" &&
      !conAsistencia.has(r.id),
  );
}

/** A historial entry plus its sort key — the gym-local "YYYY-MM-DDTHH:MM:SS" the merge orders on.
 *  An untimed mark keeps its day and sorts to the END of it (no time to place it any better). */
interface FilaHistorial {
  clave: string;
  fila: FichaAsistencia;
}

/** The "No asistió — cargada" lines (§D4), rendered at the CLASS SESSION's date/time — the
 *  charge's own moment is the booking, but the operator reads this list by when the class was.
 *  Display only: `no_show` stays derived, never a status write. */
function filasNoAsistio(
  entrada: EntradaSaldo,
  asistencias: FichaAsistRow[],
  anclas: AnclaVenta[],
  anchorId: string | null,
  tz: string,
): FilaHistorial[] {
  return reservasNoAsistidas(entrada.reservas, asistencias, anclas, anchorId, tz, entrada.ahora)
    .filter((r) => r.class_session !== null)
    .map((r) => {
      const s = r.class_session!;
      const { dia, hora } = momentoEnZona(s.starts_at, tz);
      const d = parseDay(dia);
      return {
        clave: `${dia}T${hora}`,
        fila: {
          dDisplay: `${DOW[d.getDay()].toLowerCase()} ${d.getDate()}`,
          hora: hora.slice(0, 5),
          today: false,
          clase: etiquetaClase(s, tz),
          origen: "clase" as const,
          tipo: "no_asistio" as const,
          // A noShow is anchor-attributed by construction (`reservasNoAsistidas` filters on it).
          paqueteAnterior: false,
        },
      };
    });
}

/** Merge the no-show lines into the visit list WITHOUT reordering the visits: the DAL orders
 *  asistencias by `fecha` alone, so two marks on one day keep their fetched order (#178's
 *  METCON-then-YOGA pairing depends on it). Each no-show is simply dropped in ahead of the first
 *  visit older than it. */
function fusionarHistorial(visitas: FilaHistorial[], noAsistio: FilaHistorial[]): FichaAsistencia[] {
  const extra = [...noAsistio].sort((a, b) => (a.clave < b.clave ? 1 : a.clave > b.clave ? -1 : 0));
  const out: FichaAsistencia[] = [];
  let j = 0;
  for (const v of visitas) {
    while (j < extra.length && extra[j].clave > v.clave) out.push(extra[j++].fila);
    out.push(v.fila);
  }
  while (j < extra.length) out.push(extra[j++].fila);
  return out;
}

/** Everything the ficha derives at read, minus the I/O-sourced hoyIso + vecinos. */
export interface FichaDerivada {
  cliente: ClienteDerivado;
  /** Raw stored balance (#269) — same underlying facts as `cliente.clasesRestLabel`/
   *  `cliente.venceDisplay` but UNDERIVED: a delete-preview computes its own subtraction from
   *  these numbers, not from display strings. NULL clasesRestantes = ilimitado. */
  clasesRestantes: number | null;
  vence: string | null; // 'YYYY-MM-DD'
  /** @deprecated superseded by `clasesGauge` (depletion bar, no N/M fraction). */
  totalClases: number | null;
  /** @deprecated superseded by `diasGauge`. */
  dayDenom: number;
  /** Clases depletion bar, anchored to the last purchase. null = hide the bar
   *  (no ventas, or ilimitado clases — both render just the número). */
  clasesGauge: ClasesGauge | null;
  /** The balance EXPLAINED from events (§D1) — the gauge's counts come from here, and the
   *  epoch-scoped `mostrarDiscrepancia` is the only gate the admin-only note may read. */
  saldo: SaldoDetalle;
  /** Días depletion bar, anchored to the last purchase. null = hide (no ventas). */
  diasGauge: DiasGauge | null;
  compradoDisplay: string;
  altaDisplay: string;
  /** Whether the member holds today's ACCESO LIBRE visit — the ONE row the ficha's
   *  2-arg toggle writes and undoes. A class visit never sets this (#89). */
  presentHoy: boolean;
  horaHoy: string | null;
  /** Today's CLASS visits, one entry per visit (`hora` = the ARRIVAL "HH:MM", or null for
   *  an untimed row; `clase` = the visit label, see FichaAsistencia). INFORMATION ONLY:
   *  the ficha can neither mark nor undo a class visit — the Agenda roster owns those —
   *  but it must both STAMP them above the toggle and COUNT them in the historial. */
  clasesHoy: { hora: string | null; clase: string }[];
  historial: FichaAsistencia[];
  pagos: FichaPago[];
  ventasCount: number;
  /** True when the member has never had a sale (#77) — drives the ficha's
   *  first-purchase statement card + CTA. A precomputed DTO boolean (the client
   *  component can't import server derive code), mirroring `pendienteOnline`. */
  primeraCompra: boolean;
  mensajes: MensajeDTO[];
}

/**
 * Shape the ficha from already-fetched rows. PURE — `hoy`/`hoyIso` are passed
 * in (Chihuahua-local), the recordatorio body + negocio are pre-fetched; no I/O.
 * `asistencias` is the rolling 30-day window (widened to the last purchase when
 * older), most-recent first; `ventas` is the full history ordered LAST-WRITTEN
 * first (created_at desc — never fecha, which a backdate can push into the past;
 * spec §D3), so `ventas[0]` is the active package / saldo anchor. The `fecha`-based
 * displays below (compradoDisplay / the días-gauge anchor) are the effective/sold
 * day and stay on `fecha` deliberately. `saldo` (§D1) carries the bookings, the read's instant
 * and — for an anchor older than the fetched window — the DAL's exact charge count; it REPLACES
 * the old `attendedSincePurchase` visit count, whose fetch machinery the DAL repurposed (§D2).
 */
export function shapeFicha(
  c: FichaClienteRow,
  asistencias: FichaAsistRow[],
  ventas: FichaVentaRow[],
  /** The read's contexto: the gym's calendar day (which also bounds "hoy" in the
   *  historial below) and its pase-suelto catalog. REQUIRED, and required
   *  TOGETHER — the catalog used to be an optional trailing param, and a ficha
   *  that omitted it painted a spent drop-in SIN CLASES/"Crítico" while the roster
   *  read the SAME row VIGENTE/"ok" (#225 F2's residual). */
  ctx: ContextoVeredicto,
  /** The resolved gym's IANA zone (PRD #17 named exception, audit finding 1) —
   *  every timestamptz→calendar-day conversion below (pagos/compradoDisplay/
   *  altaDisplay/lastPurchaseDate) resolves in THIS zone, never a hardcoded one. */
  tz: string,
  plantillas: PlantillaDTO[],
  negocio: string,
  /** The saldo derivation's extra inputs (§D1). Defaulted so a fixture that renders no
   *  bookings keeps the short positional call shape. */
  saldoEntrada: EntradaSaldo = SALDO_VACIO,
  /** The two operator-wide tokens the cliente row can't supply — the package
   *  price list ({precios}) and how-to-pay ({datos_pago}). Optional + LAST so the
   *  pure unit tests keep their positional call shape; the DAL fills them in. */
  extras: { precios?: string; datos_pago?: string } = {},
): FichaDerivada {
  const hoyIso = ctx.hoy;
  const saldo = saldoDetalle(c.clases_restantes, ventas, asistencias, tz, saldoEntrada);
  // §D4 attribution tags. A visit row is tagged `(paquete anterior)` when the charge BEHIND it
  // landed on a venta older than the anchor — which for a booking-charged check-in is the
  // BOOKING's instant, not the mark's (the class was debited when it was held).
  const anclas = anclasVenta(ventas, tz);
  const cobradas = reservasCobradas(saldoEntrada.reservas);
  const reservaPorId = new Map(saldoEntrada.reservas.map((r) => [r.id, r]));
  const anchorId = saldo.anchor?.ventaId ?? null;
  const esAnterior = (m: MomentoCargo | null): boolean =>
    anchorId !== null && m !== null && ventaAtribuida(anclas, m) !== anchorId;

  const visitas: FilaHistorial[] = asistencias
    // Today is rendered separately (the leaf re-prepends a HOY row); excluding it
    // here is load-bearing — without it the ficha would double-render today.
    .filter((a) => a.fecha !== hoyIso)
    .map((a) => {
      const d = parseDay(a.fecha);
      const reserva = a.reservation_id ? reservaPorId.get(a.reservation_id) : undefined;
      const momento: MomentoCargo | null = esCargableAsistencia(a, cobradas)
        ? { dia: a.fecha, hora: a.hora }
        : reserva && esCargableReserva(reserva)
          ? momentoEnZona(reserva.created_at, tz)
          : null;
      return {
        clave: `${a.fecha}T${a.hora ?? "00:00:00"}`,
        fila: {
          dDisplay: `${DOW[d.getDay()].toLowerCase()} ${d.getDate()}`,
          hora: a.hora ? a.hora.slice(0, 5) : null,
          today: false,
          clase: a.class_session_id === null ? null : etiquetaClase(a.class_session, tz),
          origen: a.origen,
          tipo: "visita" as const,
          paqueteAnterior: esAnterior(momento),
        },
      };
    });
  const historial = fusionarHistorial(
    visitas,
    filasNoAsistio(saldoEntrada, asistencias, anclas, anchorId, tz),
  );
  // The ficha's toggle is the 2-arg (ACCESO LIBRE) one, so its checked state keys on the
  // LIBRE row ALONE (#89): a member who attended a class today is not "marked" by anything
  // this screen can undo, and rendering them checked would make the next tap insert a
  // second, consuming libre row instead of undoing. Their class visits still have to be
  // VISIBLE — as read-only gold stamps, the same idiom the desk row uses for a visit in
  // another context.
  const hoyRows = asistencias.filter((a) => a.fecha === hoyIso);
  const libreHoy = hoyRows.find((a) => a.class_session_id === null);
  const presentHoy = libreHoy !== undefined;
  const horaHoy = libreHoy?.hora?.slice(0, 5) ?? null;
  const clasesHoy = hoyRows
    .filter((a) => a.class_session_id !== null)
    .map((a) => ({ hora: a.hora ? a.hora.slice(0, 5) : null, clase: etiquetaClase(a.class_session, tz) }));

  const pagos: FichaPago[] = ventas.map((v) => {
    const fechaGym = fechaEnZona(v.fecha, tz);
    return {
      id: v.id,
      folio: v.folio,
      fechaDisplay: fmtShort(fechaGym),
      paquete: v.paquete_nombre,
      montoDisplay: pesos(v.monto),
      metodoDisplay: metodoLabel(v.metodo),
      monto: v.monto,
      metodo: v.metodo as FichaPago["metodo"],
      fecha: v.fecha,
      fechaIso: toIsoDay(fechaGym),
      clases: v.clases,
      vigenciaTipo: v.vigencia_tipo as FichaPago["vigenciaTipo"],
      vigenciaDias: v.vigencia_dias,
      createdAt: v.created_at,
      mes: MONTHS_FULL[fechaGym.getMonth()],
    };
  });

  const latest = ventas[0];
  const totalClases = latest?.clases ?? null;
  // `|| 30` (not `?? 30`): a stored vigencia_dias of 0 must also fall back, else
  // the days ring divides by zero (cliente-detalle.tsx renders diasRest / dayDenom).
  const dayDenom = latest ? (latest.vigencia_tipo === "mes" ? 30 : latest.vigencia_dias || 30) : 30;
  const compradoDisplay = latest ? fmtShort(fechaEnZona(latest.fecha, tz)) : "—";
  const altaDate = fechaEnZona(c.created_at, tz);
  const altaDisplay = fmtShort(altaDate);

  const cliente = derivarCliente(c, ctx, asistencias.length, "no_leidas");
  const { clases: clasesRest, dias: diasRest } = cliente.veredicto;

  // Saldo depletion gauges, anchored to the last purchase (`ventas[0]`). No ventas
  // → no anchor → both null (UI renders just the números). Ilimitado clases → the
  // clases bar is meaningless (no decrement ever happens) → its gauge is null too.
  const lastPurchaseDate = latest ? fechaEnZona(latest.fecha, tz) : null;
  const venceDate = c.vence ? parseDay(c.vence) : null;

  // §D2 honest gauge: the denominator is the anchor's GRANT, so the bar can no longer absorb
  // drift by denominating on the balance it is drawing. An ilimitado anchor (grant null) has no
  // gauge, exactly as today. The FILL still reads the read-time forfeited number — the same one
  // the big número prints — so an expired pack shows 0 over an empty bar instead of resurrecting
  // a balance the screen simultaneously calls 0; the RAW stored balance drives the invariant
  // (`saldo.restantes` / `derived` / `discrepancia`) where honesty, not coherence, is the job.
  const clasesGauge: ClasesGauge | null =
    lastPurchaseDate && saldo.anchor?.grant != null && clasesRest !== "ilimitado"
      ? {
          fill: gaugeFill(clasesRest, saldo.anchor.grant),
          usadas: saldo.usadas,
          apartadas: saldo.apartadas,
          total: saldo.anchor.grant,
        }
      : null;

  const diasGauge: DiasGauge | null =
    lastPurchaseDate && venceDate
      ? { fill: gaugeFill(diasRest ?? 0, diasDenom(venceDate, lastPurchaseDate)) }
      : null;

  const plantillaCtx: PlantillaContext = {
    nombre: firstName(c.nombre),
    clases: fmtClases(clasesRest),
    paquete: cliente.paquete,
    vence: cliente.venceDisplay,
    // sin_paquete (#225 F1): a package-less client has NO countdown — `dias` is
    // honestly null, and feeding a fabricated 0 into fmtDias would compose a FALSE
    // "vence hoy" (a same-day expiry that isn't real) into the Renovación body.
    // Honest copy instead, and — under #226's phrase contract, where {dias} is
    // embedded directly ("Tu paquete {dias} — ¿lo renovamos?") — the substitution
    // must itself read as a verb phrase: "ya no está activo", not the noun-phrase
    // "sin paquete activo" (which read oddly beside the sentence's own "Tu paquete"
    // subject once the fixed "vence en" prefix was removed, #226 F8).
    dias: diasRest === null ? "ya no está activo" : fmtDias(diasRest),
    precios: extras.precios,
    datos_pago: extras.datos_pago,
    negocio,
  };
  const mensajes: MensajeDTO[] = renderMensajes(plantillas, plantillaCtx);

  return {
    cliente,
    clasesRestantes: c.clases_restantes,
    vence: c.vence,
    totalClases,
    dayDenom,
    clasesGauge,
    saldo,
    diasGauge,
    compradoDisplay,
    altaDisplay,
    presentHoy,
    horaHoy,
    clasesHoy,
    historial,
    pagos,
    ventasCount: ventas.length,
    primeraCompra: esPrimeraCompra(ventas.length),
    mensajes,
  };
}

// ── Membresía (member plan card) derivation ────────────────────────
// The client app's plan card (slice #61) funnels the `mi_membresia()` RPC's RLS-privileged SCALARS
// through the SAME pure sub-helpers the admin ficha's shapeFicha uses (forfeit / gaugeFill), so the
// member's gauge equals the admin ficha's for the same client — ONE derivation home. Contract-A is
// preserved by construction: no raw ventas/asistencias arrays reach this layer, only the anchor
// monto/vigencia display fields + the counts the RPC already computed.
// Slice 2 §D2/§D3 moved BOTH surfaces off the self-fulfilling `restantes + usadas` denominator and off
// the #173 VISIT numerator: the bar now denominates on the anchor's GRANT and the caption counts §D0
// CHARGES, which the RPC computes in SQL (`cargadas` / `grant_clases` / `apartadas`) so the member's
// card and the ficha cannot drift. Parity with the admin ficha is still the criterion, and both moved
// together — the AC5 parity test in derive.test.ts is what holds them there.

/** The scalars `mi_membresia()` returns — the RLS-privileged anchor fields + the entitlement pass-throughs.
 *  The three §D3 additions (`cargadas` / `grantClases` / `apartadas`) are the SQL side of §D0, so the
 *  member's card and the admin ficha count the same charges against the same denominator. The RPC still
 *  returns `attended_since_purchase` with its old day-anchored VISIT semantics for the deployed client —
 *  it is deliberately NOT read here any more (§D2: the caption's count is the CHARGE count). */
export interface MembresiaFacts {
  paqueteNombre: string | null;
  clasesRestantes: number | null; // NULL = ilimitado
  vence: string | null; // 'YYYY-MM-DD'
  anchorMonto: number | null; // NULL = no anchor sale (no bar, no price)
  anchorVigenciaTipo: string | null; // 'mes' | 'dias'
  anchorVigenciaDias: number | null;
  /** §D0 charge count attributed to the anchor (`mi_membresia.cargadas`). */
  cargadas: number;
  /** The anchor sale's grant, `ventas.clases` (`mi_membresia.grant_clases`) — NULL = ilimitado pack. */
  grantClases: number | null;
  /** Charged holds whose class has not ended yet (`mi_membresia.apartadas`). */
  apartadas: number;
}

/** The plan card's clases depletion gauge — the SAME shape/meaning as shapeFicha's ClasesGauge, plus the
 *  `restantes` the card's "N de N" caption renders. */
export interface MembresiaGauge {
  usadas: number; // §D0 charges against the anchor pack
  apartadas: number; // charged holds whose class hasn't ended yet
  total: number; // the anchor sale's GRANT (§D2) — never restantes + usadas
  restantes: number; // classes left now
  fill: number; // 0–1 bar fill (restantes / total, clamped)
}

export interface MembresiaDerivada {
  planNombre: string; // "8 clases" / "Ilimitado" / "Sin plan"
  ilimitado: boolean; // no finite count (∞) — the card hides the gauge
  /** Vigencia lapsed (`vence` before `hoy`). Derived INDEPENDENT of `forfeit`, so an expired
   *  ILIMITADO reads as vencido too (#118 E3) — the plan card renders its expired state instead
   *  of a full ∞ bar + "activo". vence-day itself is valid (dias === 0, ruling C9). */
  vencido: boolean;
  clasesRestLabel: string; // "∞" / "5" / "0"
  precioDisplay: string | null; // "$800" — the anchor sale's monto; null when no anchor
  cadenciaLabel: string | null; // "al mes" / "30 días"; null when no anchor
  renovacionDisplay: string | null; // "16 jun"; null when no vence
  gauge: MembresiaGauge | null; // null = ilimitado or no anchor (no bar)
}

/**
 * Shape the plan card from the RPC scalars. PURE — `ctx` carries the gym-local day and the gym's
 * pase-suelto catalog. Runs the SAME `derivarVeredicto` the admin roster/ficha do, so the estado and
 * the number the member sees equal the admin ficha's for the same client; the gauge math below is
 * unchanged (shapeFicha's clasesGauge construction, sub-helper for sub-helper).
 */
export function derivarMembresia(m: MembresiaFacts, ctx: ContextoVeredicto): MembresiaDerivada {
  const veredicto = derivarVeredicto(
    {
      paquete_nombre: m.paqueteNombre,
      clases_restantes: m.clasesRestantes,
      vence: m.vence,
      // The caller IS the signed-in member reading their own membership — the auth
      // link is a given here, not a column this RPC returns.
      tieneCuenta: true,
      visitas: "no_leidas", // the plan card renders no absence badge
    },
    ctx,
  );

  const venceDate = m.vence ? parseDay(m.vence) : null;
  // Read-time forfeit lives in the veredicto now (IDENTICAL rule to the admin ficha).
  const clasesRest = veredicto.clases;
  const ilimitado = clasesRest === "ilimitado";
  // Lapsed by DATE, independent of forfeit (which leaves ilimitado untouched) — so ∞ shows expired
  // too (E3): FECHA WINS means an expired ilimitado is `vencido`, never `sin_clases`.
  const vencido = veredicto.estado === "vencido";
  const hasAnchor = m.anchorMonto !== null;

  // Clases depletion gauge — the SAME guard + math as shapeFicha.clasesGauge (§D2): denominator is the
  // anchor's GRANT, hidden (null) for ilimitado (no decrement ever), for an ilimitado anchor (no grant to
  // divide by) or when there is no anchor sale at all.
  const gauge: MembresiaGauge | null =
    hasAnchor && m.grantClases !== null && clasesRest !== "ilimitado"
      ? {
          usadas: m.cargadas,
          apartadas: m.apartadas,
          total: m.grantClases,
          restantes: clasesRest,
          fill: gaugeFill(clasesRest, m.grantClases),
        }
      : null;

  return {
    planNombre: m.paqueteNombre ?? "Sin plan",
    ilimitado,
    vencido,
    clasesRestLabel: ilimitado ? "∞" : String(clasesRest),
    precioDisplay: hasAnchor ? pesos(m.anchorMonto) : null,
    cadenciaLabel: hasAnchor
      ? m.anchorVigenciaTipo === "mes"
        ? "al mes"
        : `${m.anchorVigenciaDias} días`
      : null,
    renovacionDisplay: venceDate ? fmtShort(venceDate) : null,
    gauge,
  };
}
