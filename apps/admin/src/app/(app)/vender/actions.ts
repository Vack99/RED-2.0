"use server";

import { enviarInvitacion } from "@gym/data/server/invitaciones";
import {
  crearVenta,
  DuplicadoError,
  type InviteState,
  type ReciboResult,
  type VentaResult,
} from "@gym/data/server/ventas";

/** The vender screen switches on this: a completed sale (recibo) or the RPC's duplicate
 *  guard tripping (D2), so the UI can offer "usar existente / crear nuevo de todos modos". */
export type CrearVentaResult =
  | { ok: true; recibo: ReciboResult }
  | { ok: false; duplicado: { id: string } };

/**
 * Thin write seam (ADR-0001): delegate to the DAL, which Zod-validates, re-auths, and runs the RPC. Then —
 * for a NEW client with an email — auto-send the invite (ADR-0015 / issue #68) and stitch the resulting
 * state onto the recibo. The send is BEST-EFFORT: `enviarInvitacion` never throws, and the sale result is
 * returned regardless, so a failed email can never break a recorded sale (design §3).
 *
 * The DAL's `DuplicadoError` (D2) is mapped to a typed non-throwing result so the component renders the
 * duplicate dialog instead of the generic failure toast. All other errors propagate to the toast path.
 *
 * No cache invalidation is needed: every (app) page reads through the cookie-bound Supabase server client,
 * which forces dynamic rendering, so a write is reflected on the next read automatically.
 */
export async function crearVentaAction(raw: unknown): Promise<CrearVentaResult> {
  let result: VentaResult;
  try {
    result = await crearVenta(raw);
  } catch (e) {
    if (e instanceof DuplicadoError) return { ok: false, duplicado: { id: e.existingId } };
    throw e;
  }
  return { ok: true, recibo: { ...result, invite: await resolverInvitacion(result) } };
}

/** Fire the auto-invite for a NEW-client sale with an email; map its outcome to the recibo's invite state.
 *  EXISTENTE sales (`no-aplica`) and emailless NEW sales (`sin-email`) never send. */
async function resolverInvitacion(result: VentaResult): Promise<InviteState> {
  if (!result.cliente.isNew) return { estado: "no-aplica" };
  const email = result.emailIngresado;
  if (!email) return { estado: "sin-email" };

  const envio = await enviarInvitacion({ clienteId: result.cliente.id });
  return envio.ok ? { estado: "enviada", email } : { estado: "fallo", email };
}
