// ──────────────────────────────────────────────────────────────
// Forge domain rules — pure functions implementing the brief's
// business rules. NO side effects, NO I/O, NO React/Supabase.
// 100% unit-tested in rules.test.ts. This is the single home for
// "how the gym works"; screens/DAL call these, never reimplement them.
// ──────────────────────────────────────────────────────────────

import type {
  AsistenciaResumen,
  Clases,
  CompraPaquete,
  EstadoCliente,
  NivelUrgencia,
  PlantillaContext,
  ResumenMes,
  ResumenRoster,
  Saldo,
  Urgencia,
  VentaResumen,
  Vigencia,
} from "./types";

/**
 * Buying a package early STACKS onto the current one (brief Q5):
 * classes add, days add. Ilimitado classes stay ilimitado.
 * Example: {clases:5, dias:3} + {clases:8, dias:20} => {clases:13, dias:23}.
 */
export function stackPaquete(actual: Saldo, nuevo: CompraPaquete): Saldo {
  const clases: Clases =
    actual.clases === "ilimitado" || nuevo.clases === "ilimitado"
      ? "ilimitado"
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
 * `vigencia` days; Ilimitado ("mes") runs to the last day of the purchase
 * calendar month (brief Q1). Returns a date at local midnight; the caller
 * owns the timezone of the input (Forge: America/Chihuahua).
 */
export function calcVigenciaEnd(fechaCompra: Date, vigencia: Vigencia): Date {
  const y = fechaCompra.getFullYear();
  const m = fechaCompra.getMonth();
  if (vigencia === "mes") {
    // Day 0 of next month == last day of this month.
    return new Date(y, m + 1, 0);
  }
  const end = new Date(y, m, fechaCompra.getDate());
  end.setDate(end.getDate() + vigencia);
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
 * Derive a client's lifecycle state from what's left (ADR-0002 — never
 * stored). Replaces the stored `estado` field and the three conflicting
 * threshold checks scattered across the mock screens.
 *  - sin_clases: expired (dias <= 0) OR out of classes (clases <= 0)
 *  - por_vencer: <= 5 days left OR <= 2 classes left (not ilimitado)
 *  - activo: otherwise
 */
export function derivarEstado(saldo: Saldo): EstadoCliente {
  const expirado = saldo.dias <= 0;
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
 * On expiry, remaining classes are FORFEITED (brief Q2): returns 0 once
 * `dias` <= 0. Ilimitado has no count to forfeit; otherwise unchanged.
 */
export function forfeit(clases: Clases, dias: number): Clases {
  if (clases === "ilimitado") return "ilimitado";
  return dias <= 0 ? 0 : clases;
}

/**
 * The base a NEW purchase stacks onto (brief Q2 + Q5). A still-valid package
 * (dias > 0) contributes its full saldo; an expired one is forfeited ENTIRELY
 * so a renewal starts clean. Note this differs from read-time `forfeit`: a
 * lapsed *ilimitado* does NOT carry forward as unlimited here — buying a
 * limited package after an unlimited month ended gives the limited count, not
 * perpetual ∞. The single home for "what stacking builds on"; the write path
 * MUST call this instead of re-deriving the expiry check inline.
 */
export function baseParaStack(saldo: Saldo): Saldo {
  return saldo.dias > 0 ? saldo : { clases: 0, dias: 0 };
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
 * passed in (a Chihuahua-local Date), never read from a clock; no I/O. The DAL
 * maps DB rows to the minimal VentaResumen / AsistenciaResumen shapes (parsing
 * dates at the boundary) and calls this with `hoyChihuahua()`.
 *
 * Reported windows:
 *  - *Mes / *MesPrev: the current and prior CALENDAR months (prior rolls across
 *    a year boundary, e.g. Jan hoy → Dec prev).
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

  let ingresosMes = 0;
  let ventasMes = 0;
  let ingresosMesPrev = 0;
  let ventasMesPrev = 0;
  let ingresosSemana = 0;

  for (const venta of ventas) {
    if (mismoMes(venta.fecha, hoy)) {
      ingresosMes += venta.monto;
      ventasMes += 1;
    } else if (mismoMes(venta.fecha, mesPrev)) {
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
    else if (mismoMes(asis.fecha, mesPrev)) asistMesPrev += 1;

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
