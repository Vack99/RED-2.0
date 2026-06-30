"use client";

import * as React from "react";
import { ForgeLockup } from "@/components/forge/brand";
import { Icon } from "@gym/ui/forge/icon";
import { MensajePicker } from "@gym/ui/forge/mensaje-picker";
import { Button, Eyebrow, H1, Tnum } from "@gym/ui/forge/ui";
import type { VentaResult } from "@/lib/data/ventas";
import { pesos, waLink } from "@/lib/format";

export function Recibo({
  result,
  onClose,
  onOtra,
  onVerCliente,
}: {
  result: VentaResult;
  onClose: () => void;
  onOtra: () => void;
  onVerCliente: (id: string) => void;
}) {
  const { folio, cliente: c, paquete: p, metodoDisplay, fechaDisplay, compradoDisplay, venceDisplay, negocio, ciudad, coach } = result;
  const isNew = c.isNew;
  const [showCheck, setShowCheck] = React.useState(false);
  const [msgOpen, setMsgOpen] = React.useState(false);
  React.useEffect(() => {
    const t = setTimeout(() => setShowCheck(true), 80);
    return () => clearTimeout(t);
  }, []);

  const wa = () => setMsgOpen(true);

  const perf = "repeating-linear-gradient(to right, var(--canvas) 0 4px, transparent 4px 10px)";

  return (
    <div className="bg-canvas">
      <div className="flex items-center justify-between" style={{ padding: "14px 16px 8px" }}>
        <div style={{ width: 56 }} />
        <Eyebrow color="var(--gold)">VENTA CONFIRMADA</Eyebrow>
        <button onClick={onClose} className="font-bold" style={{ background: "transparent", border: "none", color: "var(--muted)", fontSize: 11, letterSpacing: 1.2, cursor: "pointer" }}>CERRAR</button>
      </div>

      {/* Body — flows into the shell's <main> scroller (no nested scroll container) */}
      <div style={{ padding: "12px 0 24px" }}>
        <div className="flex justify-center" style={{ padding: "20px 22px 12px" }}>
          <div
            className="flex items-center justify-center"
            style={{ width: 84, height: 84, background: "var(--yellow)", transform: showCheck ? "scale(1)" : "scale(0.4)", opacity: showCheck ? 1 : 0, transition: "transform 420ms cubic-bezier(.32,1.5,.5,1), opacity 280ms ease", boxShadow: "0 12px 40px color-mix(in srgb, var(--yellow) 33%, transparent)" }}
          >
            <Icon name="check" size={48} color="var(--ink)" />
          </div>
        </div>

        <div style={{ padding: "0 22px 16px", textAlign: "center" }}>
          <H1 size={30}>{isNew ? "CLIENTE Y\nVENTA CREADOS" : "VENTA\nREGISTRADA"}</H1>
          <div style={{ marginTop: 10, fontSize: 13, color: "var(--muted)", maxWidth: 290, marginLeft: "auto", marginRight: "auto" }}>
            {isNew
              ? `${c.nombre.split(" ")[0]} ya está dado de alta con su primer paquete activo.`
              : `Folio listo y paquete activo en la ficha de ${c.nombre.split(" ")[0]}.`}
          </div>
        </div>

        {/* Receipt — fixed cream palette in both themes */}
        <div style={{ margin: "8px 16px 0" }}>
          <div style={{ background: "#f5f1ea", color: "#1c1917", padding: "22px 22px 24px", position: "relative", boxShadow: "0 16px 40px rgba(0,0,0,0.4)" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: perf }} />
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 4, background: perf }} />

            <div className="flex items-start justify-between">
              <ForgeLockup size={11} />
              <div style={{ textAlign: "right" }}>
                <div className="uppercase" style={{ fontSize: 9.5, color: "#7a5a26", letterSpacing: 1.5 }}>FOLIO</div>
                <Tnum className="font-extrabold" style={{ fontSize: 14, color: "#1c1917" }}>F-{folio}</Tnum>
              </div>
            </div>

            <div style={{ height: 1, background: "#1c1917", opacity: 0.15, margin: "16px 0" }} />

            <div className="flex items-baseline justify-between" style={{ marginBottom: 4 }}>
              <div className="uppercase" style={{ fontSize: 9.5, color: "#7a5a26", letterSpacing: 1.5 }}>CLIENTE</div>
              {isNew && <div className="uppercase" style={{ fontSize: 9, color: "#7a5a26", letterSpacing: 1.5, padding: "2px 6px", background: "rgba(199,149,69,0.18)" }}>NUEVO</div>}
            </div>
            <div className="uppercase font-extrabold" style={{ fontSize: 18, letterSpacing: 0.4, marginTop: 2 }}>{c.nombre}</div>
            <Tnum style={{ display: "block", marginTop: 3, fontSize: 11.5, color: "#7a5a26" }}>{c.tel}</Tnum>

            <div style={{ height: 1, background: "#1c1917", opacity: 0.15, margin: "14px 0" }} />

            <div className="uppercase" style={{ fontSize: 9.5, color: "#7a5a26", letterSpacing: 1.5 }}>CONCEPTO</div>
            <div className="flex justify-between" style={{ marginTop: 6, fontSize: 14 }}>
              <span>{p.nombre}</span>
              <Tnum style={{ fontWeight: 700 }}>{pesos(p.precio)}.00</Tnum>
            </div>
            <div style={{ marginTop: 6, fontSize: 11.5, color: "#7a5a26" }}>Vigencia · {p.vigencia}</div>

            <div style={{ height: 1, background: "#1c1917", opacity: 0.15, margin: "14px 0" }} />

            {[
              ["FECHA", fechaDisplay.toUpperCase()],
              ["VIGENCIA", `${compradoDisplay.toUpperCase()} → ${venceDisplay.toUpperCase()}`],
              ["MÉTODO", metodoDisplay],
              ["ATIENDE", coach.toUpperCase()],
            ].map(([k, v], i) => (
              <div key={i} className="flex justify-between" style={{ padding: "4px 0", fontSize: 11.5, color: "#7a5a26", letterSpacing: 0.6 }}>
                <span>{k}</span>
                <Tnum style={{ color: "#1c1917", fontWeight: 600 }}>{v}</Tnum>
              </div>
            ))}

            <div className="flex items-baseline justify-between" style={{ marginTop: 14, padding: "14px 0 4px", borderTop: "2px solid #1c1917" }}>
              <span className="uppercase font-extrabold" style={{ fontSize: 14, letterSpacing: 0.4 }}>TOTAL</span>
              <Tnum className="font-extrabold" style={{ fontSize: 28, letterSpacing: -0.6 }}>
                {pesos(p.precio)}
                <span style={{ fontSize: 11, color: "#7a5a26", marginLeft: 6, letterSpacing: 1, fontWeight: 700 }}>MXN</span>
              </Tnum>
            </div>

            <div className="uppercase" style={{ marginTop: 14, fontSize: 10.5, color: "#7a5a26", letterSpacing: 1, textAlign: "center" }}>
              {`${negocio}${ciudad ? ` · ${ciudad}` : ""}`}
            </div>
          </div>
        </div>

        <div className="flex flex-col" style={{ padding: "20px 16px 0", gap: 10 }}>
          <Button variant="wa" full icon="wa" onClick={wa}>ENVIAR POR WHATSAPP</Button>
          <div className="flex" style={{ gap: 8 }}>
            {!isNew && (
              <Button variant="secondary" full icon="user" onClick={() => onVerCliente(c.id)}>VER CLIENTE</Button>
            )}
            <Button variant="secondary" full icon="plus" onClick={onOtra}>OTRA VENTA</Button>
          </div>
        </div>
      </div>

      <MensajePicker
        open={msgOpen}
        onClose={() => setMsgOpen(false)}
        titulo="ENVIAR RECIBO"
        mensajes={result.mensajes}
        onEnviar={(m) => {
          window.open(waLink(c.tel, m.texto), "_blank");
          setMsgOpen(false);
        }}
      />
    </div>
  );
}
