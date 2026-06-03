// Shared helpers for building a PlantillaContext + rendering the templates.
// Both send sites — the ficha (derive.ts) and the post-sale recibo (ventas.ts) —
// must supply the SAME full token set, so the per-token formatting and the
// MensajeDTO construction live here once instead of being duplicated (and drifting)
// at each call site. Pure: no I/O, no Supabase — unit-tested in plantilla-ctx.test.ts.

import { renderPlantilla } from "@/domain/rules";
import type { PlantillaContext } from "@/domain/types";
import { pesos } from "@/lib/format";

import type { CobroDTO } from "./cobro";
import type { PaqueteDTO } from "./paquetes";
import type { MensajeDTO, PlantillaDTO } from "./plantillas";

/** Render every template against one send context. Single home for MensajeDTO construction
 *  (was duplicated in derive.ts + ventas.ts). */
export function renderMensajes(plantillas: PlantillaDTO[], ctx: PlantillaContext): MensajeDTO[] {
  return plantillas.map((p) => ({ id: p.id, nombre: p.nombre, texto: renderPlantilla(p.body, ctx) }));
}

/** The {dias} token: days-to-expiry as a short es-MX display string. A non-positive
 *  count (expired, or no package → 0) reads "vencido" rather than "0 días"/"-3 días". */
export function fmtDias(diasRest: number): string {
  if (diasRest <= 0) return "vencido";
  return `${diasRest} día${diasRest === 1 ? "" : "s"}`;
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
