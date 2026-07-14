"use server";

import { getOperatorGym } from "@gym/data/server/gym";
import { enviarInvitacion } from "@gym/data/server/invitaciones";
import { createClient } from "@gym/data/server/supabase";
import {
  crearVenta,
  DuplicadoError,
  EmailEnUsoError,
  type InviteState,
  type ReciboEmailState,
  type ReciboResult,
  type VentaResult,
} from "@gym/data/server/ventas";

import { enviarReciboDeVenta } from "./recibo-envio";

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
    // The auto receipt email (#99) — EVERY sale with an email on hand, new and renewal alike.
    enviarReciboDeVenta(result),
  ]);
  return { ok: true, recibo: { ...result, invite, reciboEmail } };
}

/**
 * The card's manual (re)send (#101): retry a failed auto-send, or send after the operator captured an
 * address the client just gave. Strictly an in-session retry from the sale's own return values — no
 * receipt archive, and capturing the address here does NOT write it to the client row (that's the ficha's
 * job). `emailOverride` (the just-captured address) wins over the sale-time resolution; it is deliberately
 * NOT `.email()`-validated (same posture as the sale path — garbage bounces, it doesn't block).
 *
 * Guarded by the caller's own gym membership (`getOperatorGym` throws without one), and the sender
 * identity is NOT trusted from the payload: `negocio` — the `From:` display name and the ticket's
 * brand line — is re-resolved server-side from the caller's gym, so an authenticated caller can
 * never emit platform mail branded as someone else. A failed check reports without sending: `fallo`
 * to the known address, else the unchanged `sin-email`. Best-effort throughout: `enviarReciboDeVenta`
 * never throws.
 */
export async function reenviarReciboAction(
  venta: VentaResult,
  emailOverride?: string,
): Promise<ReciboEmailState> {
  const override = emailOverride?.trim() || undefined;
  let brandName: string;
  try {
    brandName = (await getOperatorGym(await createClient())).brandName;
  } catch {
    const dest = override ?? venta.emailCliente;
    return dest ? { estado: "fallo", email: dest } : { estado: "sin-email" };
  }
  return enviarReciboDeVenta({ ...venta, negocio: brandName }, { email: override });
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
