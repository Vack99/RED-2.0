// ──────────────────────────────────────────────────────────────
// Forge domain rules — pure functions implementing the brief's
// business rules. NO side effects, NO I/O, NO React/Supabase.
// 100% unit-tested in rules.test.ts. This is the single home for
// "how the gym works"; screens/DAL call these, never reimplement them.
// ──────────────────────────────────────────────────────────────

import type { Clases, CompraPaquete, Saldo } from "./types";

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
