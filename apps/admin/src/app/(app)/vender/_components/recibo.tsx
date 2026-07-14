"use client";

import * as React from "react";
import { Icon } from "@gym/ui/forge/icon";
import { MensajePicker } from "@gym/ui/forge/mensaje-picker";
import { Button, Eyebrow, H1, Input, Tnum } from "@gym/ui/forge/ui";
import type { InviteState, ReciboEmailState, ReciboResult, VentaResult } from "@gym/data/server/ventas";
import { pesos, waLink } from "@gym/format";

import { reenviarReciboAction } from "../actions";

export function Recibo({
  result,
  primeraCompra = false,
  cuentaActiva = false,
  lockup,
  onClose,
  onOtra,
  onVerCliente,
}: {
  result: ReciboResult;
  /** The EXISTENTE client's first ever purchase (#77) — snapshotted at finish().
   *  Retitles the receipt; ignored for a NUEVO sale (its creation copy already
   *  carries the first-purchase meaning). */
  primeraCompra?: boolean;
  /** That client already has an app account — the first-purchase subtitle then
   *  promises app reservations rather than a desk-only paquete. */
  cuentaActiva?: boolean;
  /** The resolved marca's lockup, rendered server-side (grill lock (g)). */
  lockup: React.ReactNode;
  onClose: () => void;
  onOtra: () => void;
  onVerCliente: (id: string) => void;
}) {
  const { folio, cliente: c, paquete: p, metodoDisplay, fechaDisplay, compradoDisplay, venceDisplay, negocio, ciudad, invite, reciboEmail } = result;
  const isNew = c.isNew;
  const primerNombre = c.nombre.split(" ")[0];
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
          <H1 size={30}>{isNew ? "CLIENTE Y\nVENTA CREADOS" : primeraCompra ? "PRIMERA COMPRA\nCOBRADA" : "VENTA\nREGISTRADA"}</H1>
          <div style={{ marginTop: 10, fontSize: 13, color: "var(--muted)", maxWidth: 290, marginLeft: "auto", marginRight: "auto" }}>
            {isNew
              ? `${primerNombre} tiene su paquete activo.`
              : primeraCompra
                ? cuentaActiva
                  ? `${primerNombre} ya puede reservar desde su app.`
                  : `Paquete activo en la ficha de ${primerNombre}.`
                : `Folio listo y paquete activo en la ficha de ${primerNombre}.`}
          </div>
          {isNew && <InviteNote invite={invite} />}
          <ReciboEmailRail initial={reciboEmail} venta={result} />
        </div>

        {/* Receipt — fixed cream palette in both themes. Colors read the receipt-scoped
            `--recibo-*` custom properties (#102): defaults in globals.css reproduce the Forge
            card byte-for-byte; RED re-keys them via the brand stylesheet (#103). */}
        <div style={{ margin: "8px 16px 0" }}>
          <div className="recibo-card" style={{ background: "var(--recibo-paper)", color: "var(--recibo-ink)", padding: "22px 22px 24px", position: "relative", boxShadow: "0 16px 40px rgba(0,0,0,0.4)" }}>
            <div style={{ position: "absolute", top: 0, left: 0, right: 0, height: 4, background: perf }} />
            <div style={{ position: "absolute", bottom: 0, left: 0, right: 0, height: 4, background: perf }} />

            <div className="flex items-start justify-between">
              {lockup}
              <div style={{ textAlign: "right" }}>
                <div className="uppercase" style={{ fontSize: 9.5, color: "var(--recibo-label)", letterSpacing: 1.5 }}>FOLIO</div>
                <Tnum className="font-extrabold" style={{ fontSize: 14, color: "var(--recibo-ink)" }}>F-{folio}</Tnum>
              </div>
            </div>

            <div style={{ height: 1, background: "var(--recibo-ink)", opacity: 0.15, margin: "16px 0" }} />

            <div className="flex items-baseline justify-between" style={{ marginBottom: 4 }}>
              <div className="uppercase" style={{ fontSize: 9.5, color: "var(--recibo-label)", letterSpacing: 1.5 }}>CLIENTE</div>
              {isNew && <div className="uppercase" style={{ fontSize: 9, color: "var(--recibo-label)", letterSpacing: 1.5, padding: "2px 6px", background: "var(--recibo-badge)" }}>NUEVO</div>}
            </div>
            <div className="uppercase font-extrabold" style={{ fontSize: 18, letterSpacing: 0.4, marginTop: 2 }}>{c.nombre}</div>
            <Tnum style={{ display: "block", marginTop: 3, fontSize: 11.5, color: "var(--recibo-label)" }}>{c.tel}</Tnum>

            <div style={{ height: 1, background: "var(--recibo-ink)", opacity: 0.15, margin: "14px 0" }} />

            <div className="uppercase" style={{ fontSize: 9.5, color: "var(--recibo-label)", letterSpacing: 1.5 }}>CONCEPTO</div>
            <div className="flex justify-between" style={{ marginTop: 6, fontSize: 14 }}>
              <span>{p.nombre}</span>
              <Tnum style={{ fontWeight: 700 }}>{pesos(p.precio)}.00</Tnum>
            </div>
            <div style={{ marginTop: 6, fontSize: 11.5, color: "var(--recibo-label)" }}>Vigencia · {p.vigencia}</div>

            <div style={{ height: 1, background: "var(--recibo-ink)", opacity: 0.15, margin: "14px 0" }} />

            {[
              ["FECHA", fechaDisplay.toUpperCase()],
              ["VIGENCIA", `${compradoDisplay.toUpperCase()} → ${venceDisplay.toUpperCase()}`],
              ["MÉTODO", metodoDisplay],
            ].map(([k, v], i) => (
              <div key={i} className="flex justify-between" style={{ padding: "4px 0", fontSize: 11.5, color: "var(--recibo-label)", letterSpacing: 0.6 }}>
                <span>{k}</span>
                <Tnum style={{ color: "var(--recibo-ink)", fontWeight: 600 }}>{v}</Tnum>
              </div>
            ))}

            <div className="flex items-baseline justify-between" style={{ marginTop: 14, padding: "14px 0 4px", borderTop: "2px solid var(--recibo-ink)" }}>
              <span className="uppercase font-extrabold" style={{ fontSize: 14, letterSpacing: 0.4 }}>TOTAL</span>
              <Tnum className="font-extrabold" style={{ fontSize: 28, letterSpacing: -0.6 }}>
                {pesos(p.precio)}
                <span style={{ fontSize: 11, color: "var(--recibo-label)", marginLeft: 6, letterSpacing: 1, fontWeight: 700 }}>MXN</span>
              </Tnum>
            </div>

            <div className="uppercase" style={{ marginTop: 14, fontSize: 10.5, color: "var(--recibo-label)", letterSpacing: 1, textAlign: "center" }}>
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

/** The post-sale invite state for a NEW client (design §3): the receipt stops implying app access already
 *  exists and instead states whether the invite was sent, is blocked on a missing email, or failed (re-sendable
 *  from the ficha). Never rendered for an EXISTENTE sale (`no-aplica`). */
function InviteNote({ invite }: { invite: InviteState }) {
  let accent = "var(--muted)";
  let text: string;
  switch (invite.estado) {
    case "enviada":
      accent = "var(--yellow)";
      text = `Invitación enviada a ${invite.email}. Al activarla podrá reservar en la app.`;
      break;
    case "sin-email":
      accent = "var(--gold)";
      text = "Sin email — sin acceso a la app. Agrega su correo en la ficha para invitarlo.";
      break;
    case "fallo":
      accent = "var(--gold)";
      text = `No pudimos enviar la invitación a ${invite.email}. Puedes reenviarla desde su ficha.`;
      break;
    case "no-aplica":
      return null;
  }
  return <Nota accent={accent} text={text} />;
}

/** The receipt-mail rail (#99 note + #101 manual send): local state seeded from the sale result drives the
 *  note, and the operator can (re)send from here without leaving the celebration screen. Two affordances,
 *  both quiet and best-effort (a failure never breaks the card):
 *    · a known address (enviado/fallo) → a subtle REENVIAR that re-sends to that same address;
 *    · no address (sin-email) → an inline capture field to type the address the client just gave and send
 *      to it. Nothing here is persisted to the client row (that's the ficha's job; spec #96). */
function ReciboEmailRail({ initial, venta }: { initial: ReciboEmailState; venta: VentaResult }) {
  const [envio, setEnvio] = React.useState<ReciboEmailState>(initial);
  const [correo, setCorreo] = React.useState("");
  const [pending, startSend] = React.useTransition();

  const enviar = (override?: string) =>
    startSend(async () => {
      setEnvio(await reenviarReciboAction(venta, override));
    });

  if (envio.estado === "enviado" || envio.estado === "fallo") {
    const address = envio.email;
    return (
      <>
        <ReciboEmailNote envio={envio} />
        <div className="flex justify-center">
          <button
            type="button"
            onClick={() => enviar(address)}
            disabled={pending}
            className="uppercase font-bold"
            style={{ background: "transparent", border: "none", color: "var(--muted)", fontSize: 10.5, letterSpacing: 1.4, cursor: pending ? "default" : "pointer", opacity: pending ? 0.5 : 1, padding: "8px 6px 0" }}
          >
            {pending ? "ENVIANDO…" : "REENVIAR"}
          </button>
        </div>
      </>
    );
  }

  // sin-email — the in-session capture path. Offered for renewals AND new sales (for a new sale the invite
  // note above already explains the missing email; this sits under it as the receipt-only send).
  return (
    <div style={{ maxWidth: 300, margin: "12px auto 0", textAlign: "left" }}>
      <div className="uppercase" style={{ fontSize: 10, color: "var(--muted)", letterSpacing: 1.4, marginBottom: 6 }}>
        ENVIAR RECIBO POR EMAIL
      </div>
      <div className="flex" style={{ gap: 8, alignItems: "stretch" }}>
        <Input placeholder="correo@ejemplo.com" value={correo} onChange={setCorreo} inputMode="email" className="flex-1" />
        <Button variant="secondary" size="sm" onClick={() => enviar(correo)} disabled={pending || !correo.trim()}>
          {pending ? "…" : "ENVIAR"}
        </Button>
      </div>
    </div>
  );
}

/** The post-sale receipt-mail note (#99): the send-outcome sibling of InviteNote. The rail renders it only
 *  for a known address (enviado/fallo); `sin-email` is handled by the rail's capture field, so its branch
 *  is a no-op here. */
function ReciboEmailNote({ envio }: { envio: ReciboEmailState }) {
  switch (envio.estado) {
    case "enviado":
      return <Nota accent="var(--yellow)" text={`Recibo enviado a ${envio.email}.`} />;
    case "fallo":
      return <Nota accent="var(--gold)" text={`No pudimos enviar el recibo a ${envio.email}.`} />;
    case "sin-email":
      return null;
  }
}

/** The shared note chip both send states render (invite + receipt mail). */
function Nota({ accent, text }: { accent: string; text: string }) {
  return (
    <div
      className="flex items-start"
      style={{ gap: 8, marginTop: 12, padding: "10px 12px", border: "1px solid var(--line)", background: "var(--surface)", maxWidth: 300, marginLeft: "auto", marginRight: "auto", textAlign: "left" }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 999, background: accent, marginTop: 5, flexShrink: 0 }} />
      <span style={{ fontSize: 12, lineHeight: 1.45, color: "var(--fg)" }}>{text}</span>
    </div>
  );
}
