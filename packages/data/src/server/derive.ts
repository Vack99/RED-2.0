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
import { DOW, fechaEnZona, firstName, fmtShort, horaEnZona, iniciales, parseDay, pesos } from "@gym/format";

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

/** Clases-bar denominator: the balance granted at the last purchase = what's left
 *  now plus every visit counted since that purchase (#173: not-soft-deleted, not
 *  `perdonada` — a booked class visit is written `consumio = false`, so gating on
 *  `consumio` would drop it from this denominator too). */
export function clasesDenom(clasesRest: number, attendedSincePurchase: number): number {
  return clasesRest + attendedSincePurchase;
}

/** Días-bar denominator: the full validity window granted at the last purchase =
 *  days from that purchase to `vence` (drains by calendar time). */
export function diasDenom(vence: Date, lastPurchaseDate: Date): number {
  return diasRestantes(vence, lastPurchaseDate);
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
}
export interface FichaPago {
  fechaDisplay: string;
  paquete: string;
  montoDisplay: string;
  metodo: string;
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
/** A venta row reduced to what the ficha's pagos list + saldo gauges need. */
export interface FichaVentaRow {
  fecha: string;
  paquete_nombre: string;
  monto: number;
  metodo: string;
  clases: number | null;
  vigencia_tipo: string;
  vigencia_dias: number | null;
}

/** A saldo depletion gauge: the fill ratio (0–1) the bar renders. The clases gauge
 *  also carries `usadas` (the "usadas X" caption); the días caption is `venceDisplay`. */
export interface ClasesGauge {
  fill: number;
  usadas: number;
}
export interface DiasGauge {
  fill: number;
}

/** Everything the ficha derives at read, minus the I/O-sourced hoyIso + vecinos. */
export interface FichaDerivada {
  cliente: ClienteDerivado;
  /** @deprecated superseded by `clasesGauge` (depletion bar, no N/M fraction). */
  totalClases: number | null;
  /** @deprecated superseded by `diasGauge`. */
  dayDenom: number;
  /** Clases depletion bar, anchored to the last purchase. null = hide the bar
   *  (no ventas, or ilimitado clases — both render just the número). */
  clasesGauge: ClasesGauge | null;
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
 * day and stay on `fecha` deliberately. `attendedSincePurchase` is the exact count
 * of consumed classes since that purchase, computed by the DAL (which alone knows
 * whether the windowed rows already cover the anchor date).
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
  attendedSincePurchase: number,
  /** The two operator-wide tokens the cliente row can't supply — the package
   *  price list ({precios}) and how-to-pay ({datos_pago}). Optional + LAST so the
   *  pure unit tests keep their positional call shape; the DAL fills them in. */
  extras: { precios?: string; datos_pago?: string } = {},
): FichaDerivada {
  const hoyIso = ctx.hoy;
  const historial: FichaAsistencia[] = asistencias
    // Today is rendered separately (the leaf re-prepends a HOY row); excluding it
    // here is load-bearing — without it the ficha would double-render today.
    .filter((a) => a.fecha !== hoyIso)
    .map((a) => {
      const d = parseDay(a.fecha);
      return {
        dDisplay: `${DOW[d.getDay()].toLowerCase()} ${d.getDate()}`,
        hora: a.hora ? a.hora.slice(0, 5) : null,
        today: false,
        clase: a.class_session_id === null ? null : etiquetaClase(a.class_session, tz),
        origen: a.origen,
      };
    });
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

  const pagos: FichaPago[] = ventas.map((v) => ({
    fechaDisplay: fmtShort(fechaEnZona(v.fecha, tz)),
    paquete: v.paquete_nombre,
    montoDisplay: pesos(v.monto),
    metodo: metodoLabel(v.metodo),
  }));

  const latest = ventas[0];
  const totalClases = latest?.clases ?? null;
  // `|| 30` (not `?? 30`): a stored vigencia_dias of 0 must also fall back, else
  // the days ring divides by zero (cliente-detalle.tsx renders diasRest / dayDenom).
  const dayDenom = latest ? (latest.vigencia_tipo === "mes" ? 30 : latest.vigencia_dias || 30) : 30;
  const compradoDisplay = latest ? fmtShort(fechaEnZona(latest.fecha, tz)) : "—";
  const altaDisplay = fmtShort(fechaEnZona(c.created_at, tz));

  const cliente = derivarCliente(c, ctx, asistencias.length, "no_leidas");
  const { clases: clasesRest, dias: diasRest } = cliente.veredicto;

  // Saldo depletion gauges, anchored to the last purchase (`ventas[0]`). No ventas
  // → no anchor → both null (UI renders just the números). Ilimitado clases → the
  // clases bar is meaningless (no decrement ever happens) → its gauge is null too.
  const lastPurchaseDate = latest ? fechaEnZona(latest.fecha, tz) : null;
  const venceDate = c.vence ? parseDay(c.vence) : null;

  const clasesGauge: ClasesGauge | null =
    lastPurchaseDate && clasesRest !== "ilimitado"
      ? {
          fill: gaugeFill(clasesRest, clasesDenom(clasesRest, attendedSincePurchase)),
          usadas: attendedSincePurchase,
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
    totalClases,
    dayDenom,
    clasesGauge,
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
// through the SAME pure sub-helpers the admin ficha's shapeFicha uses (forfeit / clasesDenom / gaugeFill),
// so the member's "N de N clases" gauge equals the admin ficha's for the same client — ONE derivation
// home. Contract-A is preserved by construction: no raw ventas/asistencias arrays reach this layer, only
// the anchor monto/vigencia display fields + the attendedSincePurchase count the RPC already computed.
// The gauge no longer inherits the consume-at-booking skew (#57/#60) that 20260706210000 deliberately
// left unfixed: a class is charged (clasesRestantes decremented) at booking time, but was only counted
// into attendedSincePurchase at ATTENDANCE if the visit happened to be written consumio = true — a
// walk-in row. A booked visit is written consumio = false (already charged), so it never joined the
// count at all, undercounting every booked class forever (#173). Both surfaces now count VISITS
// (deleted_at is null and not perdonada), the unit asistencias_mes_por_cliente already counts — parity
// with the admin ficha is still the criterion, and both were fixed together.

/** The scalars `mi_membresia()` returns — the RLS-privileged anchor fields + the entitlement pass-throughs. */
export interface MembresiaFacts {
  paqueteNombre: string | null;
  clasesRestantes: number | null; // NULL = ilimitado
  vence: string | null; // 'YYYY-MM-DD'
  anchorMonto: number | null; // NULL = no anchor sale (no bar, no price)
  anchorVigenciaTipo: string | null; // 'mes' | 'dias'
  anchorVigenciaDias: number | null;
  attendedSincePurchase: number;
}

/** The plan card's clases depletion gauge — the SAME shape/meaning as shapeFicha's ClasesGauge, plus the
 *  `total`/`restantes` the card's "N de N" caption renders. */
export interface MembresiaGauge {
  usadas: number; // classes consumed since the anchor purchase
  total: number; // the balance granted at that purchase (usadas + restantes)
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

  // Clases depletion gauge — the SAME guard + math as shapeFicha.clasesGauge: hidden (null) for ilimitado
  // (no decrement ever) or when there is no anchor sale (nothing to divide by).
  const gauge: MembresiaGauge | null =
    hasAnchor && clasesRest !== "ilimitado"
      ? {
          usadas: m.attendedSincePurchase,
          total: clasesDenom(clasesRest, m.attendedSincePurchase),
          restantes: clasesRest,
          fill: gaugeFill(clasesRest, clasesDenom(clasesRest, m.attendedSincePurchase)),
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
