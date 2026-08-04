// Shared helpers for building a PlantillaContext + rendering the templates.
// Both send sites — the ficha (derive.ts) and the post-sale recibo (ventas.ts) —
// must supply the SAME full token set, so the per-token formatting and the
// MensajeDTO construction live here once instead of being duplicated (and drifting)
// at each call site. Pure: no I/O, no Supabase — unit-tested in plantilla-ctx.test.ts.

import { renderPlantilla } from "@gym/domain/rules";
import type { Clases, PlantillaContext } from "@gym/domain/types";
import { pesos } from "@gym/format";

import type { CobroDTO } from "./cobro";
import type { PaqueteDTO } from "./paquetes";
import type { MensajeDTO, PlantillaDTO } from "./plantillas";

/** Render every template against one send context. Single home for MensajeDTO construction
 *  (was duplicated in derive.ts + ventas.ts). */
export function renderMensajes(plantillas: PlantillaDTO[], ctx: PlantillaContext): MensajeDTO[] {
  return plantillas.map((p) => ({ id: p.id, nombre: p.nombre, texto: renderPlantilla(p.body, ctx) }));
}

/** The {dias} token: days-to-expiry as a short es-MX display string. día 0 (the vence
 *  day itself) is a valid training day (ruling C9 / `estaVencido`) and must never read
 *  "vencido" — the off-by-one #225 exists to close ("Tu paquete vence en vencido" for
 *  every member on their vence day).
 *
 *  A genuinely NEGATIVE día count (expired) has no grammatically correct
 *  substitution here (#225 F1 residual): the seeded Renovación body is the fixed
 *  string "Tu paquete vence en {dias} — ¿lo renovamos?", and no value plugged into
 *  "{dias}" can turn "vence en" into "venció hace" from inside the token — that
 *  needs the seeded `plantillas.body` text itself, which is migration-gated (DDL
 *  seed data) and OUT OF SCOPE for this ticket. This renders the LEAST-BROKEN
 *  value instead — the signed day count ("-3 días") — never the old "vencido",
 *  which composed literal nonsense ("vence en vencido", the exact #188 S12 defect).
 *  Callers with a package-less client (estado sin_paquete, diasRest forced to 0)
 *  must NOT call this at all — see shapeFicha's ctx, which substitutes real copy
 *  instead of a fake day-0 countdown. */
export function fmtDias(diasRest: number): string {
  return `${diasRest} día${Math.abs(diasRest) === 1 ? "" : "s"}`;
}

/** The {clases} token: classes-remaining as a short es-MX display string. Ilimitado
 *  reads "clases ilimitadas"; a count always reads "{n} clases" (no singular form,
 *  so 1 → "1 clases" — matches the prior send-site behavior).
 *
 *  NOT a package name: this is a DIFFERENT context — a client's REMAINING-balance
 *  token for WhatsApp messages, not a catalog package label. It INTENTIONALLY
 *  diverges from src/domain/rules.ts nombrePaquete (which singularizes "1 clase"
 *  and renders "Ilimitado"); do not converge them. */
export function fmtClases(clases: Clases): string {
  return clases === "ilimitado" ? "clases ilimitadas" : `${clases} clases`;
}

/** The {precios} token: the operator's package price list, one bullet per line. */
export function fmtPrecios(paquetes: PaqueteDTO[]): string {
  return paquetes.map((p) => `• ${p.nombre} — ${pesos(p.precio)}`).join("\n");
}

/** The {datos_pago} token: how to pay, derived from the cobro row. Returns "" when
 *  no cobro is configured (null) or nothing payable is set up — renderPlantilla then
 *  drops the empty token's text. es-MX, kept short:
 *    "Transferencia:\n{banco} · CLABE {clabe}\nA nombre de {titular}"
 *    "Tarjeta: {tarjeta}"
 *  Only the transferencia block requires aceptaTransferencia (advisory flag); the
 *  tarjeta line follows aceptaTarjeta. Lines with no data are skipped. */
export function fmtDatosPago(cobro: CobroDTO | null): string {
  if (!cobro) return "";

  const lineas: string[] = [];

  if (cobro.aceptaTransferencia && (cobro.banco?.trim() || cobro.clabe?.trim())) {
    const banco = cobro.banco?.trim();
    const clabe = cobro.clabe?.trim();
    const cabecera = [banco, clabe ? `CLABE ${clabe}` : null].filter(Boolean).join(" · ");
    lineas.push(`Transferencia:\n${cabecera}`);
    if (cobro.titular?.trim()) lineas.push(`A nombre de ${cobro.titular.trim()}`);
  }

  if (cobro.aceptaTarjeta && cobro.tarjeta?.trim()) {
    lineas.push(`Tarjeta: ${cobro.tarjeta.trim()}`);
  }

  return lineas.join("\n");
}
