import type { VentaResult } from "@gym/data/server/ventas";
import { pesos } from "@gym/format";

import { renderStaticHtml } from "./static-html";

/**
 * The ticket twin (#99): ONE hook-free, presentational render of the sale ticket, consumed two
 * ways — serialized to the receipt email's HTML body here, and walked by Satori for the PNG
 * attachment (#100). Its constraints are Satori's, which are also email-client-safe: flexbox
 * only, literal hex colors (no `var()` — Satori has no cascade, Gmail strips `<style>`), inline
 * styles only (no Tailwind classes), every text node wrapped in its own element.
 *
 * It deliberately does NOT reuse the interactive card (`recibo.tsx`): that one is a client
 * component with hooks and a `var()`-painted brand lockup, which neither Satori nor an email
 * client can render. The twin's header is the gym's wordmark as text instead.
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

/** Email-client-safe stack for the HTML body; the PNG render passes "Outfit" (#100). */
const EMAIL_FONT_STACK = "-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif";

export function TicketTwin({
  venta,
  palette = FORGE_TICKET,
  fontFamily = EMAIL_FONT_STACK,
  width = 360,
}: {
  venta: VentaResult;
  palette?: TicketPalette;
  fontFamily?: string;
  width?: number;
}) {
  const { folio, cliente: c, paquete: p, metodoDisplay, fechaDisplay, compradoDisplay, venceDisplay, negocio, ciudad } = venta;
  const rule = { height: 1, background: palette.ink, opacity: 0.15 };
  const label = { fontSize: 9.5, color: palette.label, letterSpacing: 1.5 };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        width,
        background: palette.paper,
        color: palette.ink,
        padding: "22px 22px 24px",
        fontFamily,
        fontSize: 14,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
        <span style={{ fontSize: 16, fontWeight: 800, letterSpacing: 1.5 }}>{negocio.toUpperCase()}</span>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <span style={label}>FOLIO</span>
          <span style={{ fontSize: 14, fontWeight: 800 }}>{`F-${folio}`}</span>
        </div>
      </div>

      <div style={{ ...rule, margin: "16px 0" }} />

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginBottom: 4 }}>
        <span style={label}>CLIENTE</span>
        {c.isNew && <span style={{ fontSize: 9, color: palette.label, letterSpacing: 1.5, padding: "2px 6px", background: palette.badge }}>NUEVO</span>}
      </div>
      <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: 0.4, marginTop: 2 }}>{c.nombre.toUpperCase()}</span>
      <span style={{ marginTop: 3, fontSize: 11.5, color: palette.label }}>{c.tel}</span>

      <div style={{ ...rule, margin: "14px 0" }} />

      <span style={label}>CONCEPTO</span>
      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6 }}>
        <span style={{ fontSize: 14 }}>{p.nombre}</span>
        <span style={{ fontSize: 14, fontWeight: 700 }}>{`${pesos(p.precio)}.00`}</span>
      </div>
      <span style={{ marginTop: 6, fontSize: 11.5, color: palette.label }}>{`Vigencia · ${p.vigencia}`}</span>

      <div style={{ ...rule, margin: "14px 0" }} />

      {[
        ["FECHA", fechaDisplay.toUpperCase()],
        ["VIGENCIA", `${compradoDisplay.toUpperCase()} → ${venceDisplay.toUpperCase()}`],
        ["MÉTODO", metodoDisplay],
      ].map(([k, v]) => (
        <div key={k} style={{ display: "flex", justifyContent: "space-between", padding: "4px 0", letterSpacing: 0.6 }}>
          <span style={{ fontSize: 11.5, color: palette.label }}>{k}</span>
          <span style={{ fontSize: 11.5, color: palette.ink, fontWeight: 600 }}>{v}</span>
        </div>
      ))}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", marginTop: 14, padding: "14px 0 4px", borderTop: `2px solid ${palette.ink}` }}>
        <span style={{ fontSize: 14, fontWeight: 800, letterSpacing: 0.4 }}>TOTAL</span>
        <div style={{ display: "flex", alignItems: "flex-end" }}>
          <span style={{ fontSize: 28, fontWeight: 800, letterSpacing: -0.6 }}>{pesos(p.precio)}</span>
          <span style={{ fontSize: 11, color: palette.label, marginLeft: 6, marginBottom: 4, letterSpacing: 1, fontWeight: 700 }}>MXN</span>
        </div>
      </div>

      <div style={{ display: "flex", justifyContent: "center", marginTop: 14 }}>
        <span style={{ fontSize: 10.5, color: palette.label, letterSpacing: 1 }}>
          {`${negocio.toUpperCase()}${ciudad ? ` · ${ciudad.toUpperCase()}` : ""}`}
        </span>
      </div>
    </div>
  );
}

/** Compose the receipt email (#99): subject + the twin as the HTML body + its plain-text mirror.
 *  Pure — the caller owns recipient resolution and the send. */
export function construirReciboEmail(venta: VentaResult): { subject: string; html: string; text: string } {
  const { folio, cliente: c, paquete: p, metodoDisplay, fechaDisplay, compradoDisplay, venceDisplay, negocio, ciudad } = venta;

  const subject = `Tu recibo de ${negocio} · F-${folio}`;

  const html = renderStaticHtml(
    <div style={{ margin: "0 auto", maxWidth: 420, padding: 24 }}>
      <TicketTwin venta={venta} width={360} />
    </div>,
  );

  const text = [
    `Tu recibo de ${negocio} — Folio F-${folio}`,
    "",
    `CLIENTE: ${c.nombre}${c.isNew ? " (NUEVO)" : ""}`,
    `TEL: ${c.tel}`,
    `CONCEPTO: ${p.nombre} — ${pesos(p.precio)}.00`,
    `Vigencia · ${p.vigencia}`,
    `FECHA: ${fechaDisplay.toUpperCase()}`,
    `VIGENCIA: ${compradoDisplay.toUpperCase()} → ${venceDisplay.toUpperCase()}`,
    `MÉTODO: ${metodoDisplay}`,
    `TOTAL: ${pesos(p.precio)}.00 MXN`,
    "",
    `${negocio}${ciudad ? ` · ${ciudad}` : ""}`,
  ].join("\n");

  return { subject, html, text };
}
