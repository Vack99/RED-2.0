import { afterEach, describe, expect, it } from "vitest";

import type { MailMessage, MailResult, MailTransport } from "./invitaciones";
import { enviarReciboEmail } from "./recibo-mail";

/** Same seam as the invite tests: a recording transport captures the outgoing message. */
function recordingTransport(result: MailResult): { sent: MailMessage[]; transport: MailTransport } {
  const sent: MailMessage[] = [];
  return {
    sent,
    transport: {
      send: async (m) => {
        sent.push(m);
        return result;
      },
    },
  };
}

const MSG: MailMessage = {
  to: "socia@correo.mx",
  subject: "Tu recibo de RED · F-1001",
  html: "<div>ticket</div>",
  text: "ticket",
};

describe("enviarReciboEmail — the receipt mail's envelope (#99)", () => {
  const OLD = process.env.RESEND_FROM;
  afterEach(() => {
    if (OLD === undefined) delete process.env.RESEND_FROM;
    else process.env.RESEND_FROM = OLD;
  });

  it("threads the per-gym From display name and passes the message through untouched", async () => {
    process.env.RESEND_FROM = "Notificaciones <no-reply@ibookit.lat>";
    const { sent, transport } = recordingTransport({ ok: true });

    const res = await enviarReciboEmail(MSG, "RED", { transport });

    expect(res).toEqual({ ok: true });
    expect(sent).toHaveLength(1);
    expect(sent[0].from).toBe("RED <no-reply@ibookit.lat>");
    expect(sent[0].to).toBe("socia@correo.mx");
    expect(sent[0].subject).toBe("Tu recibo de RED · F-1001");
    expect(sent[0].html).toBe("<div>ticket</div>");
    expect(sent[0].text).toBe("ticket");
  });

  it("a failed send is a returned value, never a throw", async () => {
    const { transport } = recordingTransport({ ok: false, error: "resend 429" });

    const res = await enviarReciboEmail(MSG, "RED", { transport });

    expect(res).toEqual({ ok: false, error: "resend 429" });
  });

  it("a THROWING transport is caught — mail can never break a recorded sale", async () => {
    const transport: MailTransport = {
      send: async () => {
        throw new Error("boom");
      },
    };

    const res = await enviarReciboEmail(MSG, "RED", { transport });

    expect(res).toEqual({ ok: false, error: "boom" });
  });
});
