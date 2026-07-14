import type { MailMessage, MailResult, MailTransport } from "@gym/data/server/invitaciones";
import type { VentaResult } from "@gym/data/server/ventas";
import { afterEach, describe, expect, it } from "vitest";

import { enviarReciboDeVenta } from "./recibo-envio";

/** Same recording seam as the recibo-mail tests: a fake transport captures the outgoing message so we can
 *  assert the resolved recipient without touching Resend/env. Nothing calls createClient here — the
 *  transport is injected, so `enviarReciboDeVenta` never reaches the DAL's Supabase client. */
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

const VENTA: VentaResult = {
  folio: 1001,
  fechaDisplay: "13 jul 2026",
  compradoDisplay: "13 jul 2026",
  venceDisplay: "13 ago 2026",
  cliente: { id: "cli-1", nombre: "Andrea Ríos", tel: "614 000 0000", inicial: "AR", isNew: false },
  paquete: { nombre: "8 clases", vigencia: "30 días", precio: 800 },
  metodo: "efectivo",
  metodoDisplay: "EFECTIVO",
  negocio: "RED",
  ciudad: "Chihuahua",
  coach: "Coach",
  mensajes: [],
  emailIngresado: null,
  emailCliente: "socia@correo.mx",
};

describe("enviarReciboDeVenta — the receipt (re)send seam (#101)", () => {
  it("the manual override wins over the sale's emailCliente", async () => {
    const { sent, transport } = recordingTransport({ ok: true });

    const res = await enviarReciboDeVenta(VENTA, { email: "capturado@correo.mx", transport });

    expect(res).toEqual({ estado: "enviado", email: "capturado@correo.mx" });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("capturado@correo.mx");
  });

  it("no override + no emailCliente → sin-email, and nothing is sent", async () => {
    const { sent, transport } = recordingTransport({ ok: true });

    const res = await enviarReciboDeVenta({ ...VENTA, emailCliente: null }, { transport });

    expect(res).toEqual({ estado: "sin-email" });
    expect(sent).toHaveLength(0);
  });

  it("a transport failure is a `fallo` for the resolved address, never a throw", async () => {
    const { transport } = recordingTransport({ ok: false, error: "resend 429" });

    const res = await enviarReciboDeVenta(VENTA, { transport });

    expect(res).toEqual({ estado: "fallo", email: "socia@correo.mx" });
  });

  it("a successful send with no override resolves to emailCliente", async () => {
    const { sent, transport } = recordingTransport({ ok: true });

    const res = await enviarReciboDeVenta(VENTA, { transport });

    expect(res).toEqual({ estado: "enviado", email: "socia@correo.mx" });
    expect(sent[0].to).toBe("socia@correo.mx");
  });

  it("composes the full envelope: subject, HTML+text twins, and the PNG attachment (#100)", async () => {
    const { sent, transport } = recordingTransport({ ok: true });

    await enviarReciboDeVenta(VENTA, { transport });

    expect(sent[0].subject).toBe("Tu recibo de RED · F-1001");
    expect(sent[0].html).toContain("F-1001");
    expect(sent[0].text).toContain("F-1001");
    expect(sent[0].attachments).toHaveLength(1);
    expect(sent[0].attachments![0].filename).toBe("recibo-F1001.png");
    expect(sent[0].attachments![0].content.length).toBeGreaterThan(0);
  });

  it("a THROWING transport is caught — mail can never break a recorded sale", async () => {
    const transport: MailTransport = {
      send: async () => {
        throw new Error("boom");
      },
    };

    const res = await enviarReciboDeVenta(VENTA, { transport });

    expect(res).toEqual({ estado: "fallo", email: "socia@correo.mx" });
  });
});

describe("enviarReciboDeVenta — the per-gym From display name (ADR-0014)", () => {
  const OLD = process.env.RESEND_FROM;
  afterEach(() => {
    if (OLD === undefined) delete process.env.RESEND_FROM;
    else process.env.RESEND_FROM = OLD;
  });

  it("threads `${negocio} <addr>` from RESEND_FROM onto the message", async () => {
    process.env.RESEND_FROM = "Notificaciones <no-reply@ibookit.lat>";
    const { sent, transport } = recordingTransport({ ok: true });

    await enviarReciboDeVenta(VENTA, { transport });

    expect(sent[0].from).toBe("RED <no-reply@ibookit.lat>");
  });
});
