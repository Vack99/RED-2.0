"use server";

import { enviarInvitacion } from "@gym/data/server/invitaciones";
import { crearVenta, type InviteState, type ReciboResult, type VentaResult } from "@gym/data/server/ventas";

/**
 * Thin write seam (ADR-0001): delegate to the DAL, which Zod-validates, re-auths, and runs the domain
 * stacking. Then — for a NEW client with an email — auto-send the invite (ADR-0015 / issue #68) and stitch
 * the resulting state onto the recibo. The send is BEST-EFFORT: `enviarInvitacion` never throws, and the
 * sale result is returned regardless, so a failed email can never break a recorded sale (design §3).
 *
 * No cache invalidation is needed: every (app) page reads through the cookie-bound Supabase server client,
 * which forces dynamic rendering, so a write is reflected on the next read automatically.
 */
export async function crearVentaAction(raw: unknown): Promise<ReciboResult> {
  const result = await crearVenta(raw);
  return { ...result, invite: await resolverInvitacion(result) };
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
