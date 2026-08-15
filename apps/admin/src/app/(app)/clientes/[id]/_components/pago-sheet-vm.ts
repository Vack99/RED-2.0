// The payment-correction sheet's pure rules (#269) — the window, the monto gate, and the
// delete confirm's exact-outcome copy. Split out of pago-sheet.tsx because this repo has no
// DOM test infra (vitest.config.ts): a rule that only lives inside JSX is a rule no test can
// reach, and the confirm's numbers are the one thing the operator acts on.

import { addDays, fmtShort, parseDay, pesos } from "@gym/format";

import { inicioMinIso } from "../../../vender/_components/vender-vm";

/** The corrected-date picker's floor — `max(hoy − 30, la alta del cliente)`, the SAME bound
 *  vender's backdate picker uses, imported rather than restated so the two can't drift.
 *  Re-exported so the sheet takes all of its rules from this module. */
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
