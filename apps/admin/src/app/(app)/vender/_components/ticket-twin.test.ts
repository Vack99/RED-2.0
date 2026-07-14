import type { VentaResult } from "@gym/data/server/ventas";
import { pesos } from "@gym/format";
import { describe, expect, it } from "vitest";

import { construirReciboEmail, FORGE_TICKET } from "./ticket-twin";

const VENTA: VentaResult = {
  folio: 1001,
  fechaDisplay: "13 jul 2026",
  compradoDisplay: "13 jul 2026",
  venceDisplay: "13 ago 2026",
  cliente: { id: "cli-1", nombre: "Andrea Ríos", tel: "614 000 0000", inicial: "AR", isNew: true },
  paquete: { nombre: "8 clases", vigencia: "30 días", precio: 800 },
  metodo: "efectivo",
  metodoDisplay: "EFECTIVO",
  negocio: "RED",
  ciudad: "Chihuahua",
  coach: "Coach",
  mensajes: [],
  emailIngresado: "socia@correo.mx",
  emailCliente: "socia@correo.mx",
};

describe("construirReciboEmail — the ticket twin rendered as the email (#99)", () => {
  it("subject carries the gym brand and the folio", () => {
    expect(construirReciboEmail(VENTA).subject).toBe("Tu recibo de RED · F-1001");
  });

  it("the HTML body IS the ticket: folio, cliente, concepto, total, brand footer", () => {
    const { html } = construirReciboEmail(VENTA);
    expect(html).toContain("F-1001");
    expect(html).toContain("ANDREA RÍOS");
    expect(html).toContain("614 000 0000");
    expect(html).toContain("8 clases");
    expect(html).toContain(`${pesos(800)}.00`);
    expect(html).toContain("MXN");
    expect(html).toContain("NUEVO");
    expect(html).toContain("RED · CHIHUAHUA");
  });

  it("inline styles only, literal Forge palette, no CSS custom properties (Gmail/Satori-safe)", () => {
    const { html } = construirReciboEmail(VENTA);
    expect(html).toContain(FORGE_TICKET.paper);
    expect(html).toContain(FORGE_TICKET.label);
    expect(html).not.toContain("var(");
    expect(html).not.toContain("class=");
  });

  it("the plain-text twin mirrors the ticket lines", () => {
    const { text } = construirReciboEmail(VENTA);
    expect(text).toContain("Folio F-1001");
    expect(text).toContain("CLIENTE: Andrea Ríos (NUEVO)");
    expect(text).toContain("MÉTODO: EFECTIVO");
    expect(text).toContain(`TOTAL: ${pesos(800)}.00 MXN`);
  });

  it("a renewal drops the NUEVO badge", () => {
    const renovacion: VentaResult = { ...VENTA, cliente: { ...VENTA.cliente, isNew: false } };
    const { html, text } = construirReciboEmail(renovacion);
    expect(html).not.toContain("NUEVO");
    expect(text).not.toContain("(NUEVO)");
  });
});
