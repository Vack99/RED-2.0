import { enviarReciboEmail } from "@gym/data/server/recibo-mail";
import type { MailTransport } from "@gym/data/server/invitaciones";
import type { ReciboEmailState, VentaResult } from "@gym/data/server/ventas";

import { construirReciboEmail } from "./_components/ticket-twin";

/**
 * The one home for "send this sale's receipt" (#99/#101): the auto-send after the sale and the
 * card's manual (re)send both come through here, so the composed message can never fork. Renders
 * synchronously from the sale's own return values (the sales table doesn't snapshot resulting
 * balances — a later re-render would lie; spec #96). Best-effort end to end: the compose is
 * guarded and `enviarReciboEmail` never throws, so mail can never break a recorded sale.
 *
 * `opts.email` is the manual path's recipient override — the address the operator just captured
 * wins over the sale-time resolution. `opts.transport` is the test seam (ADR-0001).
 */
export async function enviarReciboDeVenta(
  venta: VentaResult,
  opts: { email?: string; transport?: MailTransport } = {},
): Promise<ReciboEmailState> {
  const email = opts.email || venta.emailCliente;
  if (!email) return { estado: "sin-email" };
  try {
    const { subject, html, text } = construirReciboEmail(venta);
    const envio = await enviarReciboEmail({ to: email, subject, html, text }, venta.negocio, {
      transport: opts.transport,
    });
    return envio.ok ? { estado: "enviado", email } : { estado: "fallo", email };
  } catch {
    return { estado: "fallo", email };
  }
}
