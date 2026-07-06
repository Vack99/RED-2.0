"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Sheet } from "@gym/ui/forge/sheet";
import { forgeToast } from "@gym/ui/forge/toaster";
import { Button, Eyebrow, H1 } from "@gym/ui/forge/ui";
import type { MensajeDTO } from "@gym/data/server/mensajes";

import { marcarMensajeLeidoAction } from "../actions";

/** Short "6 jul, 14:30" stamp for a message's created_at (es-MX). */
function fmtFecha(iso: string): string {
  return new Date(iso).toLocaleString("es-MX", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** The minimal admin read surface for contact-form leads: list + mark-read (PRD #49 "Contact intake").
 *  Read-only otherwise — replies happen off-platform via the channels the lead left. */
export function MensajesSheet({
  open,
  onClose,
  mensajes,
}: {
  open: boolean;
  onClose: () => void;
  mensajes: MensajeDTO[];
}) {
  const router = useRouter();
  const [saving, setSaving] = React.useState<string | null>(null);

  const marcar = async (m: MensajeDTO) => {
    setSaving(m.id);
    try {
      await marcarMensajeLeidoAction({ id: m.id });
      router.refresh();
    } catch {
      forgeToast({ tone: "warning", title: "No se pudo marcar" });
    } finally {
      setSaving(null);
    }
  };

  return (
    <Sheet open={open} onClose={onClose}>
      <div style={{ padding: "8px 22px 14px" }}>
        <Eyebrow color="var(--gold)">MENSAJES</Eyebrow>
        <H1 size={22} style={{ marginTop: 6 }}>
          CONTACTO
        </H1>
        <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5, color: "var(--muted)" }}>
          Mensajes que te dejaron desde la página de contacto.
        </div>
      </div>

      <div className="flex flex-col" style={{ padding: "0 16px 16px", gap: 8 }}>
        {mensajes.length === 0 && (
          <div
            className="flex flex-col items-center"
            style={{ gap: 8, border: "1px dashed var(--line)", background: "var(--surface)", padding: "22px 16px", textAlign: "center" }}
          >
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Sin mensajes todavía</div>
          </div>
        )}

        {mensajes.map((m) => (
          <div
            key={m.id}
            style={{
              border: "1px solid var(--line)",
              background: m.leido ? "var(--surface)" : "var(--sunk)",
              padding: "12px 14px",
            }}
          >
            <div className="flex items-center" style={{ gap: 8 }}>
              {!m.leido && (
                <span className="shrink-0" aria-label="Sin leer" style={{ width: 8, height: 8, borderRadius: "50%", background: "var(--gold)" }} />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-bold" style={{ fontSize: 13, letterSpacing: 0.3, color: "var(--fg)" }}>
                  {m.nombre}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 1 }}>{m.correo}</div>
              </div>
              <div className="shrink-0" style={{ fontSize: 10.5, color: "var(--muted-soft)" }}>
                {fmtFecha(m.createdAt)}
              </div>
            </div>
            <div style={{ marginTop: 8, fontSize: 12.5, lineHeight: 1.5, color: "var(--fg)", whiteSpace: "pre-wrap" }}>
              {m.mensaje}
            </div>
            {!m.leido && (
              <div style={{ marginTop: 10 }}>
                <Button variant="secondary" size="sm" icon="check" disabled={saving === m.id} onClick={() => marcar(m)}>
                  {saving === m.id ? "GUARDANDO…" : "MARCAR COMO LEÍDO"}
                </Button>
              </div>
            )}
          </div>
        ))}
      </div>
    </Sheet>
  );
}
