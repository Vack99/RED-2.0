// The payment-correction sheet's pure rules (#269) — the window, the monto gate, and the
// delete confirm's exact-outcome copy. Split out of pago-sheet.tsx because this repo has no
// DOM test infra (vitest.config.ts): a rule that only lives inside JSX is a rule no test can
// reach, and the confirm's numbers are the one thing the operator acts on.

import { diasRestantes } from "@gym/domain/rules";
import { addDays, fmtShort, parseDay, pesos } from "@gym/format";

import { customValido, inicioMinIso, PERSONALIZADO, type CustomForm } from "../../../vender/_components/vender-vm";

/** The corrected-date picker's floor — `hoy − 30`, the SAME bound vender's backdate picker
 *  uses, imported rather than restated so the two can't drift. Re-exported so the sheet takes
 *  all of its rules from this module. */
export { inicioMinIso };

/** Deletion is windowed at 30 days from REGISTRATION (#266.2) — `created_at`, never the
 *  backdatable sold `fecha`. Past it the affordance is simply absent (no disabled state);
 *  `docs/runbooks/venta-correction.md` stays the escape hatch. Editing has no window. */
export const ELIMINAR_VENTANA_DIAS = 30;

/** Render-time clock read, same idiom as the agenda's `esPasada`: this decides what to SHOW.
 *  `eliminar_venta` re-checks the window server-side and is the actual enforcer. */
export function dentroDeVentanaEliminar(createdAt: string, ahora: Date): boolean {
  return ahora.getTime() < Date.parse(createdAt) + ELIMINAR_VENTANA_DIAS * 86_400_000;
}

/** One sale's vigencia contribution in days — the quantity the clawback subtracts from
 *  `vence`. A 'mes' package is a flat 30 days from purchase (ruling C1), matching what
 *  `registrar_venta` granted; a null `vigencia_dias` grants nothing. */
export function vigenciaDiasVenta(tipo: "dias" | "mes", dias: number | null): number {
  return tipo === "mes" ? 30 : (dias ?? 0);
}

/** The monto field's parse rule, mirroring `editarVentaSchema` (a positive integer, no ceiling)
 *  so GUARDAR is gated before the round trip. Returns the integer the action will send, or
 *  null when the field is not a legal monto. The RPC remains the trust boundary.
 *
 *  No upper cap on purpose: the sheet seeds this field from the sale's STORED monto, which can
 *  come from a `paquetes.precio` with no ceiling of its own — a cap would freeze GUARDAR on a
 *  high-value sale and leave even its método uncorrectable. */
export function montoEditado(raw: string): number | null {
  const n = Number(raw.trim());
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/** The `fecha` the action sends, or `undefined` to omit it — mirroring vender's `esBackdate`
 *  semantics (`vender.tsx`): a day the operator did NOT change is not a correction, and omitting
 *  the arg makes `editar_venta` take its `p_fecha default null` and leave the stored timestamp
 *  (and its time-of-day) exactly as it was. Only a real change travels. */
export function fechaEditada(originalIso: string, pickIso: string): string | undefined {
  return pickIso === originalIso ? undefined : pickIso;
}

/** The calendar's displayed `sel` day, clamped into `[minIso, hoyIso]` — vender's
 *  `inicioEfectivo` clamp (`vender-vm.ts`), display-only. A sale older than the 30-day cap
 *  seeds `fecha` outside the picker's own range, which would otherwise open the calendar on a
 *  month with every day disabled. The real `fecha` state is untouched by this: the FECHA field
 *  text and `fechaEditada`'s omission logic keep reading it directly, so an untouched old date
 *  still sends nothing. */
export function fechaSeed(fechaIso: string, minIso: string, hoyIso: string): string {
  return fechaIso >= minIso && fechaIso <= hoyIso ? fechaIso : hoyIso;
}

/**
 * The delete confirm's disclosure (#267.6): what leaves the balance, where it lands, and the
 * money that leaves that month's earnings — the LAST sentence is also the analytics warning
 * ruling #266.1 requires, stated as the concrete number rather than a caveat.
 *
 * Computed here, client-side, from the same facts `eliminar_venta` subtracts, so the operator
 * reads the outcome before anything happens. Every fragment drops out when the fact behind it
 * doesn't exist — an ilimitado sale subtracts no clases (so it claims no resulting count), an
 * ilimitado balance has no count to land on, a 0-day vigencia moves no date — because the
 * dialog must never assert a number it cannot know. Used classes are NOT a refusal (#267.4):
 * the balance floors at zero and the copy says so ("quedará en 0 clases").
 */
export function previewEliminarVenta(v: {
  /** What the sale granted; null = ilimitado. */
  clases: number | null;
  /** Its vigencia contribution (see `vigenciaDiasVenta`). */
  dias: number;
  /** The client's stored balance; null = ilimitado. */
  clasesRestantes: number | null;
  /** The client's stored vence ("YYYY-MM-DD"), or null. */
  vence: string | null;
  monto: number;
  /** The sale's month, gym-local and lowercase ("agosto") — `FichaPago.mes`. */
  mes: string;
}): string {
  const resta = [
    v.clases !== null ? `${v.clases} ${v.clases === 1 ? "clase" : "clases"}` : null,
    v.dias > 0 ? `${v.dias} ${v.dias === 1 ? "día" : "días"}` : null,
  ].filter((s): s is string => s !== null);

  const nuevasClases =
    v.clases === null || v.clasesRestantes === null ? null : Math.max(0, v.clasesRestantes - v.clases);
  const queda = [
    nuevasClases !== null ? `quedará en ${nuevasClases} ${nuevasClases === 1 ? "clase" : "clases"}` : null,
    // `dias > 0` guards the fragment as well as the subtraction: at 0 días the date does not move,
    // and re-stating the unchanged vence would read as an outcome of the delete.
    v.vence && v.dias > 0 ? `vence ${fmtShort(addDays(parseDay(v.vence), -v.dias))}` : null,
  ].filter((s): s is string => s !== null);

  const ingresos = `Se restarán ${pesos(v.monto)} de los ingresos de ${v.mes}.`;
  if (resta.length === 0) return ingresos;
  const cola = queda.length > 0 ? ` → ${queda.join(", ")}` : "";
  return `Se restarán ${resta.join(" y ")}${cola}. ${ingresos}`;
}

// ── Package swap (paquete-swap spec §5.2/§6.3) ──────────────────────

/** The delete gate's floor-clip predicate (ruling 3, spec §1.3/§3) — mirrors
 *  `eliminar_venta`'s own gate exactly: `clases_restantes - clases < 0`. Landing on
 *  EXACTLY zero is allowed (the boundary #267.4 already shipped); only strictly-below is
 *  refused. An ilimitado sale (`clases` null) or an ilimitado balance (`clasesRestantes`
 *  null) can never floor, so neither trips it. The RPC re-checks this — it is the real
 *  enforcer — this only decides whether the sheet shows ELIMINAR or the muted note. */
export function clawbackPisaCero(clases: number | null, clasesRestantes: number | null): boolean {
  return clases !== null && clasesRestantes !== null && clasesRestantes - clases < 0;
}

/** Whether a correction actually moves the balance — mirrors `editar_venta`'s own
 *  `v_cambio_grant or v_cambio_fecha` guard (D0.5): a monto/metodo-only edit, or a
 *  re-post of an already-applied swap, must NOT claw back/re-grant. Drives whether the
 *  inline preview renders and whether the FECHA hint's "se recalcula" claim is live. */
export function rederivaSaldo(v: {
  ventaClases: number | null;
  ventaVigTipo: "dias" | "mes";
  ventaVigDias: number | null;
  nuevoClases: number | null;
  nuevoVigTipo: "dias" | "mes";
  nuevoVigDias: number | null;
  fechaOriginalIso: string;
  fechaIso: string;
}): boolean {
  const cambioGrant =
    v.nuevoClases !== v.ventaClases ||
    v.nuevoVigTipo !== v.ventaVigTipo ||
    v.nuevoVigDias !== v.ventaVigDias;
  const cambioFecha = v.fechaIso !== v.fechaOriginalIso;
  return cambioGrant || cambioFecha;
}

/**
 * The swap/re-derive preview — mirrors `editar_venta` §1.2 steps 14-15 EXACTLY, including
 * the one-clamp rule (D0.4: the clawback's intermediate is allowed to go negative, only the
 * FINAL re-granted number floors at zero) and registrar's own expired-restart discard (D0.9:
 * a base vence before the re-grant date contributes nothing — the correction starts a clean
 * run). Computed client-side from the same facts `editar_venta` reads, so the operator sees
 * the outcome before GUARDAR fires anything.
 *
 * The clases fragment drops only when the NEW package is itself ilimitado (`nuevo.clases ===
 * null`) — the one case D0.9's algorithm can never resolve to a concrete count. An ilimitado
 * CURRENT balance does not drop it: swapping onto a finite package from an unlimited one still
 * lands on that package's own concrete grant (the RPC's `elsif v_base_clases is null then
 * v_new_clases := v_clases` branch), so the fragment renders that real number. `vence` is
 * always renderable — "vence follows fecha" is the whole point of ruling 1.
 */
export function previewRederivarVenta(v: {
  /** The client's stored balance BEFORE the correction; null = ilimitado. */
  clasesRestantes: number | null;
  /** The client's stored vence ("YYYY-MM-DD") BEFORE the correction, or null. */
  vence: string | null;
  /** What the STORED sale currently grants — the clawback side (`dias` already collapsed,
   *  see `vigenciaDiasVenta`). */
  viejo: { clases: number | null; dias: number };
  /** What the sale will grant AFTER the correction — the re-grant side. */
  nuevo: { clases: number | null; dias: number };
  /** The sale's (possibly corrected) sold date, gym-tz ISO day — the re-grant anchor. */
  fechaIso: string;
}): string {
  const fecha = parseDay(v.fechaIso);
  const baseClasesCrudo = v.clasesRestantes === null ? null : v.clasesRestantes - (v.viejo.clases ?? 0);
  const baseVence = v.vence === null ? null : addDays(parseDay(v.vence), -v.viejo.dias);

  // D0.9 — the expired-restart discard: a base vence that is not still valid AT the
  // re-grant date contributes nothing, exactly like `registrar_venta`'s own stacking rule.
  const vigenteAlaFecha = baseVence !== null && diasRestantes(baseVence, fecha) >= 0;
  const baseDias = vigenteAlaFecha ? diasRestantes(baseVence!, fecha) : 0;
  const baseClases = vigenteAlaFecha ? baseClasesCrudo : 0;

  // D0.4 — the ONE clamp, applied only to the final number (the intermediate clawback
  // above is allowed to go negative — never rendered, never stored).
  const nuevasClases =
    v.nuevo.clases === null ? null : baseClases === null ? v.nuevo.clases : Math.max(0, baseClases + v.nuevo.clases);
  const nuevoVence = addDays(fecha, baseDias + v.nuevo.dias);

  const clasesFrag =
    nuevasClases !== null ? `quedará en ${nuevasClases} ${nuevasClases === 1 ? "clase" : "clases"}` : null;
  const partes = [clasesFrag, `vence ${fmtShort(nuevoVence)}`].filter((s): s is string => s !== null);
  return `El saldo se recalcula: ${partes.join(" · ")}.`;
}

/** The PAQUETE section's own dirty bit: a picked tile counts once it is either a registrado
 *  pick (`paqSel` set, not the personalizado sentinel) or a personalizado form that already
 *  validates — an incomplete custom form is not yet a swap the sheet can save. */
export function swapDirty(paqSel: string | null, custom: CustomForm): boolean {
  return paqSel !== null && (paqSel !== PERSONALIZADO || customValido(custom));
}
