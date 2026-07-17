// ──────────────────────────────────────────────────────────────
// Forge domain rules — pure functions implementing the brief's
// business rules. NO side effects, NO I/O, NO React/Supabase.
// 100% unit-tested in rules.test.ts. This is the single home for
// "how the gym works"; screens/DAL call these, never reimplement them.
// ──────────────────────────────────────────────────────────────

import type {
  AltaMes,
  AsistenciaResumen,
  Clases,
  CompraPaquete,
  CorteMes,
  EstadoCliente,
  EstadoSesion,
  MetodoPago,
  NivelUrgencia,
  PlantillaContext,
  PlantillaHorario,
  ResumenMes,
  ResumenRoster,
  Saldo,
  SesionOcupacion,
  Urgencia,
  VentaMes,
  VentaResumen,
  Vigencia,
} from "./types";

/**
 * Buying a package early STACKS onto the current one: paid days always carry
 * and add. Ruling C4 (2026-07-08) — the PURCHASED package's type takes effect
 * immediately ("purchase wins"): classes add only when both sides are finite;
 * buying finite over an active ilimitado yields the pack's own count (not ∞),
 * and buying ilimitado makes the stack unlimited.
 * Example: {clases:5, dias:3} + {clases:8, dias:20} => {clases:13, dias:23}.
 */
export function stackPaquete(actual: Saldo, nuevo: CompraPaquete): Saldo {
  const clases: Clases =
    nuevo.clases === "ilimitado"
      ? "ilimitado"
      : actual.clases === "ilimitado"
        ? nuevo.clases
        : actual.clases + nuevo.clases;
  return { clases, dias: actual.dias + nuevo.dias };
}

/**
 * A package's display name is its class grant. The DB RPC actualizar_paquete
 * mirrors this exact rule in SQL (it stores the derived name); keep them in
 * lockstep. `clases` is `number | null` because a package represents its grant
 * that way in the DB/DTO — NOT the Saldo "ilimitado" type. null -> "Ilimitado",
 * 1 -> "1 clase" (singular), n -> "{n} clases".
 */
export function nombrePaquete(clases: number | null): string {
  if (clases === null) return "Ilimitado";
  if (clases === 1) return "1 clase";
  return `${clases} clases`;
}

/**
 * End date of a package bought on `fechaCompra`. Fixed-day packages add
 * `vigencia` days; "mes" is a flat 30 days from the purchase date (ruling C1,
 * 2026-07-08 — month-end semantics are gone). Returns a date at local midnight;
 * the caller owns the timezone of the input (Forge: America/Chihuahua).
 */
export function calcVigenciaEnd(fechaCompra: Date, vigencia: Vigencia): Date {
  const end = new Date(fechaCompra.getFullYear(), fechaCompra.getMonth(), fechaCompra.getDate());
  end.setDate(end.getDate() + (vigencia === "mes" ? 30 : vigencia));
  return end;
}

/**
 * Whole days from `hoy` until `vence` (negative once expired). Compared at
 * local-midnight granularity so partial days never miscount.
 */
export function diasRestantes(vence: Date, hoy: Date): number {
  const a = new Date(vence.getFullYear(), vence.getMonth(), vence.getDate());
  const b = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate());
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

/**
 * Whether a package's vigencia has LAPSED: its vence day is strictly in the past
 * (`dias < 0`, where `dias = diasRestantes(vence, hoy)`). The vence day itself
 * (dias === 0) is a valid training day (ruling C9), so expiry starts the day AFTER.
 * The single home for the "expired by date" boundary — forfeit, baseParaStack,
 * derivarEstado, and every read-side "vencido" signal route through here instead of
 * re-coining `dias < 0` and risking C9 drift. Mirrors the reservar_clase RPC's
 * `vence < hoy` gate exactly at day granularity.
 */
export function estaVencido(dias: number): boolean {
  return dias < 0;
}

/**
 * Derive a client's lifecycle state from what's left (ADR-0002 — never
 * stored). Replaces the stored `estado` field and the three conflicting
 * threshold checks scattered across the mock screens.
 *  - sin_clases: expired (dias < 0) OR out of classes (clases <= 0)
 *  - por_vencer: <= 5 days left OR <= 2 classes left (not ilimitado)
 *  - activo: otherwise
 * The vence day (dias === 0) is a valid training day (ruling C9), so it lands
 * in por_vencer, not sin_clases.
 */
export function derivarEstado(saldo: Saldo): EstadoCliente {
  const expirado = estaVencido(saldo.dias);
  const sinClases = saldo.clases !== "ilimitado" && saldo.clases <= 0;
  if (expirado || sinClases) return "sin_clases";

  const pocosDias = saldo.dias <= 5;
  const pocasClases = saldo.clases !== "ilimitado" && saldo.clases <= 2;
  if (pocosDias || pocasClases) return "por_vencer";

  return "activo";
}

/**
 * Summarize a roster of derived estados into the two counts the dashboard +
 * directory headline (ADR-0002). The single home for "who counts as a vigente /
 * as an active member": `vigentes` are fully-active packages (estado "activo");
 * `totalActivos` are everyone who still counts as a member (estado !== "sin_clases")
 * — the "/ N" denominator. Screens call this, never an inline `.filter(...).length`.
 */
export function resumirRoster(estados: EstadoCliente[]): ResumenRoster {
  let vigentes = 0;
  let totalActivos = 0;
  for (const estado of estados) {
    if (estado === "activo") vigentes += 1;
    if (estado !== "sin_clases") totalActivos += 1;
  }
  return { vigentes, totalActivos };
}

// Retention-urgency thresholds, tuned for 8/12-class, 20–30 day memberships.
// The single home for "running out": the directory roster, its sort, and any
// future ficha treatment consume urgenciaCliente, never re-coin these numbers.
const URGENCIA_DIAS = { critico: 3, urgente: 7, pronto: 14 };
const URGENCIA_CLASES = { critico: 1, urgente: 3, pronto: 5 };

/**
 * A client's retention urgency from what's left: as urgent as their WORST
 * dimension (clases | días). `vinculante` is whichever lapses first. Ilimitado
 * has no class pressure, so only días can make it urgent. Replaces the threshold
 * engine that was copy-pasted into the clientes screen (invisible to the
 * dependency boundary). derivarEstado's coarser por_vencer is the lifecycle
 * projection of the same idea.
 */
export function urgenciaCliente(saldo: Saldo): Urgencia {
  const dias = saldo.dias;
  const clases = saldo.clases === "ilimitado" ? Infinity : saldo.clases;

  let nivel: NivelUrgencia = "ok";
  if (dias <= URGENCIA_DIAS.critico || clases <= URGENCIA_CLASES.critico) nivel = "critico";
  else if (dias <= URGENCIA_DIAS.urgente || clases <= URGENCIA_CLASES.urgente) nivel = "urgente";
  else if (dias <= URGENCIA_DIAS.pronto || clases <= URGENCIA_CLASES.pronto) nivel = "pronto";

  const diasN = dias / URGENCIA_DIAS.pronto;
  const clasesN = clases / URGENCIA_CLASES.pronto;
  const vinculante: "clases" | "dias" = clasesN < diasN ? "clases" : "dias";
  return { nivel, vinculante };
}

/**
 * Consume one class for an attendance. Same-day duplicate attendance is
 * allowed and each still consumes a class (brief Q6). Ilimitado is never
 * decremented; a limited count never goes below 0.
 *
 * This is the canonical statement of the consume rule. The LIVE attendance path
 * runs it transactionally inside the `toggle_pase` RPC (ADR-0005), whose guarded
 * `clases_restantes - 1 where clases_restantes > 0` mirrors this exactly; keep
 * the two in lockstep if either changes.
 */
export function consumirClase(clases: Clases): Clases {
  if (clases === "ilimitado") return "ilimitado";
  return Math.max(0, clases - 1);
}

/**
 * On expiry, remaining classes are FORFEITED: returns 0 once `dias` < 0. The
 * vence day itself (dias === 0) is a valid training day (ruling C9), so classes
 * survive it and forfeiture starts the day AFTER. Ilimitado has no count to
 * forfeit; otherwise unchanged.
 */
export function forfeit(clases: Clases, dias: number): Clases {
  if (clases === "ilimitado") return "ilimitado";
  return estaVencido(dias) ? 0 : clases;
}

/**
 * The base a NEW purchase stacks onto. A still-valid package contributes its
 * full saldo; an expired one is forfeited ENTIRELY so a renewal starts clean.
 * The vence day (dias === 0) is a valid training day (ruling C9), so it KEEPS
 * the saldo — forfeiture starts the day AFTER (dias < 0). Note this differs
 * from a lapsed read: a lapsed *ilimitado* does NOT carry forward as unlimited
 * here — buying a limited package after an unlimited month ended gives the
 * limited count, not perpetual ∞. The single home for "what stacking builds
 * on"; the write path MUST call this instead of re-deriving the expiry check
 * inline.
 */
export function baseParaStack(saldo: Saldo): Saldo {
  return estaVencido(saldo.dias) ? { clases: 0, dias: 0 } : saldo;
}

// ── Date helpers for the resumen (local-field comparisons only; the caller
//    owns the timezone — Forge hands these Chihuahua-local Dates) ──

/** True when two Dates fall on the same local calendar day. */
function mismoDia(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** True when `d` falls in the calendar month/year of `ref`. */
function mismoMes(d: Date, ref: Date): boolean {
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

/** Whole-day signed distance from `a` to `b` at local-midnight granularity. */
function difDias(a: Date, b: Date): number {
  const x = new Date(a.getFullYear(), a.getMonth(), a.getDate());
  const y = new Date(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((y.getTime() - x.getTime()) / 86_400_000);
}

/**
 * Aggregate the ventas + asistencias ledgers into the dashboard / cuenta
 * monthly resumen (ADR-0002 — derived at read, never stored). PURE: `hoy` is
 * passed in (a gym-local Date), never read from a clock; no I/O. The DAL
 * maps DB rows to the minimal VentaResumen / AsistenciaResumen shapes (parsing
 * dates at the boundary) and calls this with `hoyEnZona(tz)`.
 *
 * Reported windows:
 *  - *Mes: the current CALENDAR month-to-date.
 *  - *MesPrev: the prior CALENDAR month THROUGH the same day-of-month as hoy
 *    (prior-month-to-date — equal elapsed slice, so the delta is like-for-like;
 *    prior rolls across a year boundary, e.g. Jan hoy → Dec prev).
 *  - hoy / ayer: exact-day asistencia counts.
 *  - semana: the last 7 days INCLUSIVE of hoy. `ingresosSemana` is their venta
 *    total; `asistenciasSemana` is a 7-element daily series, oldest→newest, the
 *    last entry === hoy (drives the sparkline).
 */
export function calcularResumenMes(
  ventas: VentaResumen[],
  asistencias: AsistenciaResumen[],
  hoy: Date,
): ResumenMes {
  const mesPrev = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  const ayer = new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - 1);
  const diaHoy = hoy.getDate(); // prior-month-to-date cutoff: same elapsed day-of-month

  let ingresosMes = 0;
  let ventasMes = 0;
  let ingresosMesPrev = 0;
  let ventasMesPrev = 0;
  let ingresosSemana = 0;

  for (const venta of ventas) {
    if (mismoMes(venta.fecha, hoy)) {
      ingresosMes += venta.monto;
      ventasMes += 1;
    } else if (mismoMes(venta.fecha, mesPrev) && venta.fecha.getDate() <= diaHoy) {
      ingresosMesPrev += venta.monto;
      ventasMesPrev += 1;
    }
    const offset = difDias(venta.fecha, hoy); // 0 = hoy, >0 = in the past
    if (offset >= 0 && offset <= 6) ingresosSemana += venta.monto;
  }

  let asistMes = 0;
  let asistMesPrev = 0;
  let asistenciasHoy = 0;
  let asistenciasAyer = 0;
  // index 6 = hoy, index 0 = hoy − 6 days (oldest→newest).
  const asistenciasSemana = [0, 0, 0, 0, 0, 0, 0];

  for (const asis of asistencias) {
    if (mismoMes(asis.fecha, hoy)) asistMes += 1;
    else if (mismoMes(asis.fecha, mesPrev) && asis.fecha.getDate() <= diaHoy) asistMesPrev += 1;

    if (mismoDia(asis.fecha, hoy)) asistenciasHoy += 1;
    else if (mismoDia(asis.fecha, ayer)) asistenciasAyer += 1;

    const offset = difDias(asis.fecha, hoy); // 0 = hoy, 6 = six days ago
    if (offset >= 0 && offset <= 6) asistenciasSemana[6 - offset] += 1;
  }

  return {
    ingresosMes,
    ventasMes,
    asistMes,
    ingresosMesPrev,
    ventasMesPrev,
    asistMesPrev,
    asistenciasHoy,
    asistenciasAyer,
    ingresosSemana,
    asistenciasSemana,
  };
}

/**
 * Fold one month's ledgers into the respaldo corte (spec 2026-07-13 §2.3).
 * PURE: already-fetched rows + a month anchor + hoy — fetches nothing, reads no
 * clock (mirrors calcularResumenMes). `hoy` is what makes closed-vs-in-progress
 * expressible without a clock: when `mes` falls in hoy's month the corte is
 * PARCIAL and the prev block is cut to the same day-of-month (like-for-like);
 * otherwise the month is closed and prev is the FULL prior month.
 *
 * Deliberately NOT a generalization of calcularResumenMes: that rule is
 * hard-anchored on hoy with prior-month-to-date semantics — reusing it for a
 * closed month (e.g. hoy = last day of February) would cut January to Jan 28.
 * Prefer a little duplication over the wrong abstraction.
 *
 * Returns raw numbers only — Excel needs them summable. `ticketPromedio` is 0
 * (never NaN) for an empty month.
 */
export function calcularCorteMes(
  ventas: VentaMes[],
  asistencias: AsistenciaResumen[],
  altas: AltaMes[],
  mes: Date,
  hoy: Date,
): CorteMes {
  const mesPrev = new Date(mes.getFullYear(), mes.getMonth() - 1, 1);
  const parcial = mismoMes(mes, hoy);
  // Like-for-like cutoff for an in-progress month; Infinity = full prev (closed).
  const corteDia = parcial ? hoy.getDate() : Infinity;

  let ingresos = 0;
  let nVentas = 0;
  const porMetodo: Record<MetodoPago, number> = { efectivo: 0, transferencia: 0, tarjeta: 0 };
  const prev = { ingresos: 0, ventas: 0, asistencias: 0 };

  for (const venta of ventas) {
    if (mismoMes(venta.fecha, mes)) {
      ingresos += venta.monto;
      nVentas += 1;
      porMetodo[venta.metodo] += venta.monto;
    } else if (mismoMes(venta.fecha, mesPrev) && venta.fecha.getDate() <= corteDia) {
      prev.ingresos += venta.monto;
      prev.ventas += 1;
    }
  }

  let nAsistencias = 0;
  for (const asis of asistencias) {
    if (mismoMes(asis.fecha, mes)) nAsistencias += 1;
    else if (mismoMes(asis.fecha, mesPrev) && asis.fecha.getDate() <= corteDia) prev.asistencias += 1;
  }

  let nAltas = 0;
  for (const alta of altas) {
    if (mismoMes(alta.fecha, mes)) nAltas += 1;
  }

  return {
    ingresos,
    ventas: nVentas,
    ticketPromedio: nVentas === 0 ? 0 : ingresos / nVentas,
    porMetodo,
    altas: nAltas,
    asistencias: nAsistencias,
    parcial,
    prev,
  };
}

/**
 * Render a WhatsApp template body by substituting {token} placeholders from
 * `ctx`. Unknown tokens are left intact so a typo is visible, not silently
 * blanked. The single home for message rendering — screens must not
 * hand-build message strings (replaces the two inline builders in the mock).
 */
export function renderPlantilla(body: string, ctx: PlantillaContext): string {
  return body.replace(/\{(\w+)\}/g, (match, key: string) => {
    const value = ctx[key as keyof PlantillaContext];
    return value ?? match;
  });
}

// ── Agenda scheduling rules (Phase 5, ADR-0010) ──────────────────────────

/** capacity − active count (ADR-0010 §3 — occupancy is DERIVED, never
 *  stored). Clamped at 0 defensively; a working system never overbooks past
 *  capacity, but a read must never show a negative "quedan". */
export function disponibles(capacidad: number, activos: number): number {
  return Math.max(0, capacidad - activos);
}

/** Fraction of capacity filled (0–1) — the single home for the casi-lleno
 *  threshold check and the "%" the SEMANA view renders. */
export function ratioOcupacion(capacidad: number, activos: number): number {
  return activos / capacidad;
}

const CASI_LLENO_RATIO = 0.85;

/**
 * A session's derived estado (ADR-0010 §3, invariant §5.1 — never stored).
 * `esPrimeraNoPasada` is supplied by the caller: derivarEstadosDia computes it
 * once per day (the "which one is a continuación" scan), rather than
 * re-deriving it per session. Precedence is a strict ladder: termino (a past
 * session is ALWAYS termino, regardless of how full it was) > a_continuacion
 * > lleno > casi_lleno > normal.
 */
export function derivarEstadoSesion(
  sesion: SesionOcupacion,
  ahora: Date,
  esPrimeraNoPasada: boolean,
): EstadoSesion {
  if (sesion.startsAt.getTime() <= ahora.getTime()) return "termino";
  if (esPrimeraNoPasada) return "a_continuacion";
  if (sesion.activos >= sesion.capacidad) return "lleno";
  if (ratioOcupacion(sesion.capacidad, sesion.activos) >= CASI_LLENO_RATIO) return "casi_lleno";
  return "normal";
}

/** Index of the day's first non-past session (its "a continuación" class) in
 *  a chronologically-sorted list. -1 once the whole day is past. */
export function indicePrimeraNoPasada(sesiones: SesionOcupacion[], ahora: Date): number {
  return sesiones.findIndex((s) => s.startsAt.getTime() > ahora.getTime());
}

/**
 * Derive every session's estado for one day in a single pass — the batch
 * counterpart of derivarEstadoSesion, so "which one is a continuación" is
 * computed once, not re-scanned per row. `sesiones` must already be sorted by
 * startsAt (the DAL's read order).
 */
export function derivarEstadosDia(sesiones: SesionOcupacion[], ahora: Date): EstadoSesion[] {
  const idx = indicePrimeraNoPasada(sesiones, ahora);
  return sesiones.map((s, i) => derivarEstadoSesion(s, ahora, i === idx));
}

/**
 * Whether a session's ★ especial badge shows: a_continuación is the single
 * top-badge slot an Agenda row renders, so it supersedes the especial name
 * (mock digest: a special session that were also a-continuación would show
 * "A CONTINUACIÓN", not its name). `esEspecial` is the stored `is_special`
 * fact (ADR-0010 §1) — never itself derived.
 */
export function muestraEspecial(estado: EstadoSesion, esEspecial: boolean): boolean {
  return esEspecial && estado !== "a_continuacion";
}

// ── Editor bounds (PRD decision e) ───────────────────────────────────────

const DURACIONES_VALIDAS: readonly number[] = [30, 45, 60, 75, 90];

/** duración ∈ {30, 45, 60, 75, 90} minutes. */
export function duracionValida(min: number): boolean {
  return DURACIONES_VALIDAS.includes(min);
}

/** cupo 4–40, whole classes only. */
export function cupoValido(cupo: number): boolean {
  return Number.isInteger(cupo) && cupo >= 4 && cupo <= 40;
}

/** hora 05:00–22:45 in 15-min steps, as an "HH:MM" wall-clock string. */
export function horaValida(hhmm: string): boolean {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm);
  if (!m) return false;
  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (mm % 15 !== 0) return false;
  const total = hh * 60 + mm;
  return total >= 5 * 60 && total <= 22 * 60 + 45;
}

// ── Template materialization spec (ADR-0010 §1) ──────────────────────────

/** The zone's UTC offset (ms) AT `utcMs`: the standard two-pass Intl
 *  technique — format `utcMs`'s wall clock in `tz`, re-read those fields as if
 *  they were themselves UTC, and diff against the true UTC instant. */
function offsetMsEnZona(utcMs: number, tz: string): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = dtf.formatToParts(new Date(utcMs));
  const get = (t: string) => Number(parts.find((p) => p.type === t)!.value);
  const asIfUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour") % 24, get("minute"), get("second"));
  return asIfUtc - utcMs;
}

/**
 * Materialize one schedule_template's absolute starts_at for the week whose
 * Monday is `lunesSemana` (local Y/M/D fields — the caller resolves which
 * week; per PRD decision (k), domain never reads a gym row itself). This IS
 * the ADR-0010 §1 materialization spec: recurrence lives in the template, but
 * the stored fact is the absolute instant computed here.
 *
 * Deterministic: the same (plantilla, lunesSemana, tz) ALWAYS yields the same
 * instant — exactly what makes the DB's `(template_id, starts_at)` unique
 * guard an idempotent re-run (PRD decision c), not a separate mechanism.
 * tz-honest: the same wall clock in two different gym zones yields two
 * different absolute instants. Two-pass offset lookup: when the class day IS a
 * DST transition day (Tijuana/Ciudad Juárez, twice a year), the offset at the
 * guess differs from the offset at the true instant — re-derive at the
 * candidate, or a 06:00 class materializes at 07:00.
 */
export function materializarSesion(plantilla: PlantillaHorario, lunesSemana: Date, tz: string): Date {
  const y = lunesSemana.getFullYear();
  const m = lunesSemana.getMonth();
  const d = lunesSemana.getDate() + plantilla.weekday;
  const [hh, mm] = plantilla.startTime.split(":").map(Number);
  const guess = Date.UTC(y, m, d, hh, mm);
  const o1 = offsetMsEnZona(guess, tz);
  const o2 = offsetMsEnZona(guess - o1, tz);
  const candidato = guess - o2;
  return new Date(offsetMsEnZona(candidato, tz) === o2 ? candidato : guess - o1);
}
