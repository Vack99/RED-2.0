// ──────────────────────────────────────────────────────────────
// Forge domain rules — pure functions implementing the brief's
// business rules. NO side effects, NO I/O, NO React/Supabase.
// 100% unit-tested in rules.test.ts. This is the single home for
// "how the gym works"; screens/DAL call these, never reimplement them.
// ──────────────────────────────────────────────────────────────

import type { Clases, CompraPaquete, Saldo, Vigencia } from "./types";

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
