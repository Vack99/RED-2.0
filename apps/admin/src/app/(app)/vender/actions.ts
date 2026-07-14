"use server";

import { enviarInvitacion } from "@gym/data/server/invitaciones";
import { enviarReciboEmail } from "@gym/data/server/recibo-mail";
import {
  crearVenta,
  DuplicadoError,
  EmailEnUsoError,
  type InviteState,
  type ReciboEmailState,
  type ReciboResult,
  type VentaResult,
} from "@gym/data/server/ventas";

import { construirReciboEmail } from "./_components/ticket-twin";

/** The vender screen switches on this: a completed sale (recibo), the RPC's duplicate
 *  guard tripping (D2 — the UI offers "usar existente / crear nuevo de todos modos"),
 *  or a message-bearing refusal the UI toasts verbatim (C7 backfill-email collision). */
export type CrearVentaResult =
  | { ok: true; recibo: ReciboResult }
  | { ok: false; duplicado: { id: string } }
  | { ok: false; mensaje: string };

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
    if (e instanceof EmailEnUsoError) return { ok: false, mensaje: e.message };
    throw e;
  }
  const [invite, reciboEmail] = await Promise.all([
    resolverInvitacion(result),
    resolverReciboEmail(result),
  ]);
  return { ok: true, recibo: { ...result, invite, reciboEmail } };
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

/** Fire the auto receipt email (#99) — EVERY sale with an email on hand, new and renewal alike.
 *  Synchronous with the sale, from the RPC's own return values (the sales table doesn't snapshot
 *  resulting balances, so a later re-render would lie — spec #96). Best-effort end to end: the
 *  compose is guarded here and `enviarReciboEmail` never throws, so mail can never break a
 *  recorded sale. */
async function resolverReciboEmail(result: VentaResult): Promise<ReciboEmailState> {
  const email = result.emailCliente;
  if (!email) return { estado: "sin-email" };
  try {
    const { subject, html, text } = construirReciboEmail(result);
    const envio = await enviarReciboEmail({ to: email, subject, html, text }, result.negocio);
    return envio.ok ? { estado: "enviado", email } : { estado: "fallo", email };
  } catch {
    return { estado: "fallo", email };
  }
}
