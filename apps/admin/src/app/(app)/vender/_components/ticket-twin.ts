import type { VentaResult } from "@gym/data/server/ventas";
import { pesos } from "@gym/format";

/**
 * The ticket twin (#99): the sale ticket rendered OFF the interactive card, as the receipt email.
 * `ticketModel` is the single home for every string on the ticket; `construirReciboEmail` emits
 * the table-HTML body + its plain-text mirror. Table/block HTML is forced by Gmail, which strips
 * `flex-direction` (a flex-column ticket collapses to one inline line — walked and observed
 * 2026-07-14) and `opacity`.
 *
 * The email cannot reuse the interactive card (`recibo.tsx`): client component, hooks, and a
 * `var()`-painted brand lockup Gmail can't resolve (it strips `<style>`). The twin's header is
 * the gym's wordmark as text instead.
 */

/** The twin's palette — Forge's cream ticket values, byte-for-byte the card's (#102 keys the
 *  card to the same names; #103 adds the owner-picked RED values). */
export interface TicketPalette {
  paper: string;
  ink: string;
  label: string;
  badge: string;
}

export const FORGE_TICKET: TicketPalette = {
  paper: "#f5f1ea",
  ink: "#1c1917",
  label: "#7a5a26",
  badge: "rgba(199,149,69,0.18)",
};

/** RED on the same cream paper (#103, owner-picked "Vino" = RED's `gold` token). Must agree with
 *  `packages/brand/src/red/recibo.css` — the card reads that stylesheet, the email reads this
 *  (Gmail strips `<style>`, so the twin cannot consume the custom props). */
export const RED_TICKET: TicketPalette = {
  paper: "#f5f1ea",
  ink: "#1c1917",
  label: "#7e0d10",
  badge: "rgba(126,13,16,0.12)",
};

/** The brand → twin-palette rule the send path resolves per request (unknown brands stay Forge-cream). */
export function ticketPalette(brandId: string): TicketPalette {
  return brandId === "red" ? RED_TICKET : FORGE_TICKET;
}

/** Email-client-safe stack for the HTML body. */
const EMAIL_FONT_STACK = "-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";

/** The ticket's true size. */
export const TICKET_WIDTH = 360;

/** The divider rule's color — the card paints ink at 0.15 opacity, but Gmail strips `opacity`,
 *  so the email uses the pre-multiplied rgba of the (palette-invariant) ink #1c1917. */
const RULE_COLOR = "rgba(28,25,23,0.15)";

/** Every string on the ticket, computed once — the single content source for the email HTML and
 *  the plain-text mirror. Mirrors the card's own casing (its CSS `uppercase` becomes
 *  `.toUpperCase()` here). */
export interface TicketModel {
  marca: string;
  folio: string;
  nombre: string;
  tel: string;
  isNew: boolean;
  concepto: string;
  precioLinea: string;
  vigenciaLinea: string;
  filas: [string, string][];
  total: string;
  pie: string;
}

export function ticketModel(venta: VentaResult): TicketModel {
  const { folio, cliente: c, paquete: p, metodoDisplay, fechaDisplay, compradoDisplay, venceDisplay, negocio, ciudad, fechaInicio } = venta;
  return {
    marca: negocio.toUpperCase(),
    folio: `F-${folio}`,
    nombre: c.nombre.toUpperCase(),
    tel: c.tel,
    isNew: c.isNew,
    concepto: p.nombre,
    precioLinea: `${pesos(p.precio)}.00`,
    vigenciaLinea: `Vigencia · ${p.vigencia}`,
    filas: [
      // FECHA is the transaction day. INICIO appears only on a backdated sale (the period
      // start); one `filas` addition feeds both the email HTML and the text mirror.
      ["FECHA", fechaDisplay.toUpperCase()],
      ...(fechaInicio ? ([["INICIO", fechaInicio.toUpperCase()]] as [string, string][]) : []),
      ["VIGENCIA", `${compradoDisplay.toUpperCase()} → ${venceDisplay.toUpperCase()}`],
      ["MÉTODO", metodoDisplay],
    ],
    total: pesos(p.precio),
    pie: `${negocio.toUpperCase()}${ciudad ? ` · ${ciudad.toUpperCase()}` : ""}`,
  };
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** A two-cell label/value row — the email's stand-in for the card's space-between flex rows. */
function filaEmail(izq: string, der: string, palette: TicketPalette): string {
  return `<tr>
    <td style="padding:4px 0;font-size:11.5px;color:${palette.label};letter-spacing:0.6px">${escapeHtml(izq)}</td>
    <td align="right" style="padding:4px 0;font-size:11.5px;color:${palette.ink};font-weight:600;letter-spacing:0.6px">${escapeHtml(der)}</td>
  </tr>`;
}

/**
 * Compose the receipt email (#99): subject + a TABLE-layout HTML body + its plain-text mirror.
 * Table/block HTML only — Gmail strips `flex-direction` and `opacity`. Inline styles only; all
 * values HTML-escaped. Pure — the caller owns recipient resolution, the brand's palette (#103),
 * and the send.
 */
export function construirReciboEmail(
  venta: VentaResult,
  palette: TicketPalette = FORGE_TICKET,
): { subject: string; html: string; text: string } {
  const m = ticketModel(venta);
  const subject = `Tu recibo de ${venta.negocio} · ${m.folio}`;
  const rule = (mv: number) => `<div style="height:1px;background:${RULE_COLOR};margin:${mv}px 0;font-size:0;line-height:0">&nbsp;</div>`;
  const label = `font-size:9.5px;color:${palette.label};letter-spacing:1.5px`;

  const html = `<div style="margin:0 auto;max-width:420px;padding:24px 0">
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:${TICKET_WIDTH}px;max-width:100%;margin:0 auto;background:${palette.paper};color:${palette.ink};font-family:${EMAIL_FONT_STACK}">
    <tr><td style="padding:22px 22px 24px">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td style="font-size:16px;font-weight:800;letter-spacing:1.5px;color:${palette.ink}">${escapeHtml(m.marca)}</td>
          <td align="right">
            <div style="${label}">FOLIO</div>
            <div style="font-size:14px;font-weight:800;color:${palette.ink}">${escapeHtml(m.folio)}</div>
          </td>
        </tr>
      </table>
      ${rule(16)}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        <tr>
          <td style="${label}">CLIENTE</td>
          ${m.isNew ? `<td align="right"><span style="font-size:9px;color:${palette.label};letter-spacing:1.5px;padding:2px 6px;background:${palette.badge}">NUEVO</span></td>` : ""}
        </tr>
      </table>
      <div style="font-size:18px;font-weight:800;letter-spacing:0.4px;margin-top:2px">${escapeHtml(m.nombre)}</div>
      <div style="margin-top:3px;font-size:11.5px;color:${palette.label}">${escapeHtml(m.tel)}</div>
      ${rule(14)}
      <div style="${label}">CONCEPTO</div>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:6px">
        <tr>
          <td style="font-size:14px">${escapeHtml(m.concepto)}</td>
          <td align="right" style="font-size:14px;font-weight:700">${escapeHtml(m.precioLinea)}</td>
        </tr>
      </table>
      <div style="margin-top:6px;font-size:11.5px;color:${palette.label}">${escapeHtml(m.vigenciaLinea)}</div>
      ${rule(14)}
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%">
        ${m.filas.map(([k, v]) => filaEmail(k, v, palette)).join("\n        ")}
      </table>
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="margin-top:14px;border-top:2px solid ${palette.ink}">
        <tr>
          <td style="padding:14px 0 4px;font-size:14px;font-weight:800;letter-spacing:0.4px">TOTAL</td>
          <td align="right" style="padding:14px 0 4px">
            <span style="font-size:28px;font-weight:800;letter-spacing:-0.6px">${escapeHtml(m.total)}</span>
            <span style="font-size:11px;color:${palette.label};letter-spacing:1px;font-weight:700">&nbsp;MXN</span>
          </td>
        </tr>
      </table>
      <div align="center" style="margin-top:14px;font-size:10.5px;color:${palette.label};letter-spacing:1px;text-align:center">${escapeHtml(m.pie)}</div>
    </td></tr>
  </table>
</div>`;

  const text = [
    `Tu recibo de ${venta.negocio} — Folio ${m.folio}`,
    "",
    `CLIENTE: ${venta.cliente.nombre}${m.isNew ? " (NUEVO)" : ""}`,
    `TEL: ${m.tel}`,
    `CONCEPTO: ${m.concepto} — ${m.precioLinea}`,
    m.vigenciaLinea,
    ...m.filas.map(([k, v]) => `${k}: ${v}`),
    `TOTAL: ${m.total} MXN`,
    "",
    `${venta.negocio}${venta.ciudad ? ` · ${venta.ciudad}` : ""}`,
  ].join("\n");

  return { subject, html, text };
}
