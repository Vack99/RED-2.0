"use server";

import { revalidatePath } from "next/cache";

import { togglePase, type TogglePaseOutcome } from "@gym/data/server/asistencia";
import { actualizarCliente, reenviarInvitacion } from "@gym/data/server/clientes";
import type { EnvioResult } from "@gym/data/server/invitaciones";
import { editarVenta, eliminarVenta, EmailEnUsoError, VentaRefusalError } from "@gym/data/server/ventas";

/** The ficha edit switches on this: a saved edit (with the auto-invite outcome), or the RPC's
 *  email-in-use refusal (clientes_email_gym_uq) surfaced as a message the sheet toasts verbatim —
 *  a typed result, NOT a throw, since prod Next.js masks thrown action messages (matches vender). */
export type ActualizarClienteActionResult =
  | { ok: true; invite: EnvioResult | null }
  | { ok: false; mensaje: string };

/** Mark/undo today's attendance from the ficha. Thin write seam over the DAL. The ficha itself stays
 *  in sync via local state (or its own `router.refresh()` on the cross-attribution branch); the roster's
 *  "{n}D SIN VENIR" badge and Asist. count are a SEPARATE route (`/clientes`), so `revalidatePath` here
 *  (#184/#241) is what keeps THAT page from replaying its pre-mark render on browser back — a plain
 *  `router.refresh()` only ever refreshes the route it's called from, never a sibling one. `/inicio`'s
 *  tiles and `/asistencia`'s own roster (`getClientesParaPase`) read the same visit facts, so both get
 *  the same treatment (opus review F3) rather than relying on the currently-blanket-but-documented-
 *  TEMPORARY "refresh every previously visited page" behavior. An RPC refusal arrives as
 *  `{ ok: false, message }` (typed result, NOT a throw — prod Next.js masks thrown action messages) so
 *  the ficha can toast the reason; nothing to revalidate on that branch. */
export async function togglePaseAction(raw: unknown): Promise<TogglePaseOutcome> {
  const res = await togglePase(raw);
  if (res.ok) {
    revalidatePath("/clientes");
    revalidatePath("/inicio");
    revalidatePath("/asistencia");
  }
  return res;
}

/** Edit a client's identity (nombre + tel + optional email backfill) from the ficha. Thin write seam
 *  over the DAL; the client refreshes ITS OWN route after a successful save (matches togglePaseAction),
 *  but the roster (`/clientes`) and `/inicio`'s tiles can only be freshened from here, the write's own
 *  action — a browser-back to either otherwise replays the pre-edit name/tel/invite badge (#184/#241;
 *  same fix as togglePaseAction / crearVentaAction). The result carries the auto-invite outcome
 *  (design §3 — issue #71) so the sheet can toast it. The DAL's EmailEnUsoError
 *  (clientes_email_gym_uq collision) is mapped to a typed non-throwing result so the sheet toasts the
 *  actionable Spanish reason instead of the generic failure (same discipline as vender's
 *  crearVentaAction). */
export async function actualizarClienteAction(raw: unknown): Promise<ActualizarClienteActionResult> {
  try {
    const { invite } = await actualizarCliente(raw);
    revalidatePath("/clientes");
    revalidatePath("/inicio");
    return { ok: true, invite };
  } catch (e) {
    if (e instanceof EmailEnUsoError) return { ok: false, mensaje: e.message };
    throw e;
  }
}

/** REENVIAR (+ "enviar invitación" when sin_invitar) on the ficha (design §3 — issue #71): re-send the
 *  SAME claim code via the same best-effort rail the sale path uses. Thin write seam over the DAL; the
 *  caller refreshes ITS OWN route on success so the badge's 'Invitada {fecha}' picks up the fresh
 *  invitacion_enviada_at (matches actualizarClienteAction / togglePaseAction) — `revalidatePath` here
 *  additionally keeps the roster's and `/inicio`'s OWN invite badge/tiles from replaying stale on
 *  browser back (#184/#241). */
export async function reenviarInvitacionAction(clienteId: string): Promise<EnvioResult> {
  const res = await reenviarInvitacion(clienteId);
  if (res.ok) {
    revalidatePath("/clientes");
    revalidatePath("/inicio");
  }
  return res;
}

/** Correct (`editarVentaAction`) or hard-delete-with-clawback (`eliminarVentaAction`) a sale
 *  from the ficha's HISTORIAL DE PAGOS (#269). Both `editar_venta`/`eliminar_venta` raise a
 *  human-readable Spanish refusal ('No autorizado', 'Venta no encontrada', 'Método inválido',
 *  'Monto inválido', 'La venta ya no se puede eliminar'), which the DAL types as
 *  `VentaRefusalError` — mapped here to a typed non-throwing result (prod Next.js masks thrown
 *  action messages), same discipline as `actualizarClienteAction`. Only that NAMED class is
 *  caught: a dropped connection or an unexpected Postgres error must reach the error boundary,
 *  not be toasted at the operator as if it were something they could fix. Both earnings
 *  surfaces (`/cuenta`, `/inicio`) recompute from raw `ventas` rows on read (#267.3), so
 *  revalidating them is enough — no stored total to correct. */
export type EditarVentaActionResult = { ok: true } | { ok: false; mensaje: string };
export type EliminarVentaActionResult = { ok: true } | { ok: false; mensaje: string };

export async function editarVentaAction(raw: unknown): Promise<EditarVentaActionResult> {
  try {
    await editarVenta(raw);
    revalidatePath("/clientes");
    revalidatePath("/cuenta");
    revalidatePath("/inicio");
    return { ok: true };
  } catch (e) {
    if (e instanceof VentaRefusalError) return { ok: false, mensaje: e.message };
    throw e;
  }
}

export async function eliminarVentaAction(raw: unknown): Promise<EliminarVentaActionResult> {
  try {
    await eliminarVenta(raw);
    revalidatePath("/clientes");
    revalidatePath("/cuenta");
    revalidatePath("/inicio");
    return { ok: true };
  } catch (e) {
    if (e instanceof VentaRefusalError) return { ok: false, mensaje: e.message };
    throw e;
  }
}
