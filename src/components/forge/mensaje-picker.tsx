"use client";

import * as React from "react";
import { Sheet } from "./sheet";
import { Button, Eyebrow, H1 } from "./ui";
import { WhatsappBubble } from "./whatsapp-bubble";

export interface MensajePickerItem {
  id: string;
  nombre: string;
  texto: string;
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
                  className="uppercase font-bold transition-colors forge-pressable"
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
