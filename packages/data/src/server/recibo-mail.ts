import "server-only";

import {
  remitenteConNombre,
  resendTransport,
  type MailMessage,
  type MailTransport,
} from "./invitaciones";

/**
 * Receipt email send seam (#99). The action composes the message (the ticket-twin HTML + its
 * plain-text mirror — presentation lives in the app, not here) and this applies the mail rail's
 * envelope rules: the per-gym `From:` display name over the one platform sender (ADR-0014), the
 * injectable transport (ADR-0001), and the best-effort contract — this NEVER throws into the sale
 * path; a bad send is a returned value (design §3, same posture as `enviarInvitacion`).
 */
export type ReciboEmailEnvio = { ok: true } | { ok: false; error: string };

export async function enviarReciboEmail(
  msg: MailMessage,
  gymNombre: string,
  opts: { transport?: MailTransport } = {},
): Promise<ReciboEmailEnvio> {
  try {
    const transport = opts.transport ?? resendTransport();
    const res = await transport.send({
      ...msg,
      from: remitenteConNombre(gymNombre, process.env.RESEND_FROM),
    });
    return res.ok ? { ok: true } : { ok: false, error: res.error };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}
