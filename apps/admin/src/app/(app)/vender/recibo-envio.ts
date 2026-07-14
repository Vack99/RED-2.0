import {
  remitenteConNombre,
  resendTransport,
  type MailTransport,
} from "@gym/data/server/invitaciones";
import type { ReciboEmailState, VentaResult } from "@gym/data/server/ventas";

import { construirReciboEmail, FORGE_TICKET, type TicketPalette } from "./_components/ticket-twin";
import { generarReciboPng } from "./recibo-png";

/**
 * The one home for "send this sale's receipt" (#99/#101): the auto-send after the sale and the
 * card's manual (re)send both come through here, so the composed message can never fork. Renders
 * synchronously from the sale's own return values (the sales table doesn't snapshot resulting
 * balances — a later re-render would lie; spec #96). Best-effort end to end: this never throws,
 * so mail can never break a recorded sale. Envelope rules ride the existing mail rail: per-gym
 * `From:` display name over the one platform sender (ADR-0014), injectable transport (ADR-0001).
 *
 * `opts.email` is the manual path's recipient override — the address the operator just captured
 * wins over the sale-time resolution. `opts.palette` is the brand's twin palette (#103), resolved
 * by the action (this module stays headers-free so the transport-fake tests run in plain node).
 * `opts.transport` is the test seam.
 */
export async function enviarReciboDeVenta(
  venta: VentaResult,
  opts: { email?: string; palette?: TicketPalette; transport?: MailTransport } = {},
): Promise<ReciboEmailState> {
  const email = opts.email || venta.emailCliente;
  if (!email) return { estado: "sin-email" };
  try {
    const palette = opts.palette ?? FORGE_TICKET;
    const { subject, html, text } = construirReciboEmail(venta, palette);
    // The PNG twin is best-effort: a null render (font/Satori failure) just sends the mail without
    // the attachment — an attachment miss must never cost the receipt, nor the receipt the sale (#100).
    const png = await generarReciboPng(venta, palette);
    const transport = opts.transport ?? resendTransport();
    const res = await transport.send({
      to: email,
      subject,
      html,
      text,
      from: remitenteConNombre(venta.negocio, process.env.RESEND_FROM),
      ...(png ? { attachments: [{ filename: `recibo-F${venta.folio}.png`, content: png }] } : {}),
    });
    return res.ok ? { estado: "enviado", email } : { estado: "fallo", email };
  } catch {
    return { estado: "fallo", email };
  }
}
