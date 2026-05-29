// ──────────────────────────────────────────────────────────────
// Forge domain rules — pure functions implementing the brief's
// business rules. NO side effects, NO I/O, NO React/Supabase.
// 100% unit-tested in rules.test.ts. This is the single home for
// "how the gym works"; screens/DAL call these, never reimplement them.
// ──────────────────────────────────────────────────────────────

import type { Clases, CompraPaquete, EstadoCliente, PlantillaContext, Saldo, Vigencia } from "./types";

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
 * Consume one class for an attendance. Same-day duplicate attendance is
 * allowed and each still consumes a class (brief Q6). Ilimitado is never
 * decremented; a limited count never goes below 0.
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
