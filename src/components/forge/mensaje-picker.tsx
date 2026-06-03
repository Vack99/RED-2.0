"use client";

import * as React from "react";
import { Sheet } from "./sheet";
import { Button, Eyebrow, H1 } from "./ui";

export interface MensajePickerItem {
  id: string;
  nombre: string;
  texto: string;
}

/** A faux WhatsApp "sent" bubble: green, self-colored (good in light + dark),
 *  rounded with a little tail, plus static decorative chrome (a fixed 9:41 time
 *  and double "read" ticks). The timestamp/ticks are purely cosmetic — a literal
 *  string, never `new Date()`, to avoid a hydration mismatch. Pure CSS/JSX so
 *  this file keeps its zero domain/lib import surface. */
function WhatsappBubble({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "flex-end",
        padding: "12px 12px 14px",
        background: "var(--sunk)",
      }}
    >
      <div
        style={{
          position: "relative",
          maxWidth: "85%",
          padding: "7px 9px 5px 11px",
          background: "var(--wa-bubble)",
          color: "var(--wa-bubble-fg)",
          borderRadius: "12px 12px 4px 12px",
          boxShadow: "0 1px 1.5px rgba(0,0,0,0.28)",
          fontSize: 13.5,
          lineHeight: 1.45,
        }}
      >
        {/* tail on the bottom-right corner */}
        <span
          aria-hidden
          style={{
            position: "absolute",
            right: -6,
            bottom: 0,
            width: 0,
            height: 0,
            borderStyle: "solid",
            borderWidth: "0 0 9px 9px",
            borderColor: "transparent transparent transparent var(--wa-bubble)",
          }}
        />
        <span style={{ whiteSpace: "pre-wrap" }}>{children}</span>
        {/* meta row: static time + double read-ticks */}
        <span
          aria-hidden
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 3,
            float: "right",
            marginLeft: 10,
            marginTop: 4,
            transform: "translateY(3px)",
            fontSize: 10.5,
            lineHeight: 1,
            color: "var(--wa-bubble-meta)",
            whiteSpace: "nowrap",
          }}
        >
          9:41
          <svg width="15" height="11" viewBox="0 0 18 13" fill="none" aria-hidden>
            <path
              d="M1 7.2 4 10.2 10.6 2.8M7.4 9.4 8.6 10.6 15.2 3.2"
              stroke="#53bdeb"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
      </div>
    </div>
  );
}

/** A send-template picker. The caller owns the actual send (onEnviar) so this stays free of
 *  domain/lib imports (waLink lives in the sector). Lists the operator's templates, previews the
 *  selected one rendered for the current context, and hands the choice back. */
export function MensajePicker({
  open,
  onClose,
  titulo = "ENVIAR MENSAJE",
  mensajes,
  onEnviar,
}: {
  open: boolean;
  onClose: () => void;
  titulo?: string;
  mensajes: MensajePickerItem[];
  onEnviar: (m: MensajePickerItem) => void;
}) {
  const [selId, setSelId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- seed selection to the first template on open
      setSelId(mensajes[0]?.id ?? null);
    }
  }, [open, mensajes]);

  const sel = mensajes.find((m) => m.id === selId) ?? null;

  return (
    <Sheet open={open} onClose={onClose}>
      {/* ── Header ── */}
      <div style={{ padding: "8px 22px 16px" }}>
        <Eyebrow color="var(--gold)">PLANTILLA</Eyebrow>
        <H1 size={22} style={{ marginTop: 6 }}>{titulo}</H1>
      </div>

      {mensajes.length === 0 ? (
        /* ── Empty state ── */
        <div
          style={{
            margin: "0 16px 24px",
            padding: "16px 18px",
            borderLeft: "3px solid var(--line)",
            background: "var(--surface)",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: 1.4, color: "var(--muted)", textTransform: "uppercase", marginBottom: 6 }}>
            SIN PLANTILLAS
          </div>
          <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
            Créalas en Cuenta → Plantillas de WhatsApp.
          </div>
        </div>
      ) : (
        <>
          {/* ── Template list ── */}
          <div className="flex flex-col" style={{ padding: "0 16px", gap: 6 }}>
            {mensajes.map((m) => {
              const active = m.id === selId;
              return (
                <button
                  key={m.id}
                  onClick={() => setSelId(m.id)}
                  className="uppercase font-bold transition-colors"
                  style={{
                    textAlign: "left",
                    padding: "11px 14px 11px 16px",
                    fontSize: 11.5,
                    letterSpacing: 0.8,
                    cursor: "pointer",
                    color: active ? "var(--fg)" : "var(--muted)",
                    background: active ? "var(--surface)" : "transparent",
                    // Brutalist signature: thick left stripe on active, hairline border otherwise.
                    borderTop: "1px solid var(--line)",
                    borderRight: "1px solid var(--line)",
                    borderBottom: "1px solid var(--line)",
                    borderLeft: active ? "3px solid var(--gold)" : "3px solid transparent",
                  }}
                >
                  {m.nombre}
                </button>
              );
            })}
          </div>

          {/* ── Preview ── */}
          <div style={{ padding: "18px 16px 0" }}>
            <Eyebrow style={{ paddingLeft: 2, marginBottom: 8 }}>VISTA PREVIA</Eyebrow>
            <div style={{ border: "1px solid var(--line)" }}>
              {sel ? (
                <WhatsappBubble>{sel.texto}</WhatsappBubble>
              ) : (
                <div
                  style={{
                    padding: "18px 16px",
                    background: "var(--sunk)",
                    minHeight: 72,
                    fontSize: 13,
                    fontStyle: "italic",
                    color: "var(--muted)",
                    textAlign: "center",
                  }}
                >
                  Selecciona una plantilla para previsualizar el mensaje.
                </div>
              )}
            </div>
          </div>

          {/* ── CTA footer ── */}
          <div
            style={{
              borderTop: "1px solid var(--line)",
              margin: "20px 0 0",
              padding: "16px 16px 4px",
              background: "var(--yellow-soft)",
            }}
          >
            <Button variant="wa" size="lg" full icon="wa" disabled={!sel} onClick={() => sel && onEnviar(sel)}>
              ENVIAR POR WHATSAPP
            </Button>
          </div>
        </>
      )}
    </Sheet>
  );
}
