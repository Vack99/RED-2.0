"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/forge/icon";
import { Textarea } from "@/components/forge/input";
import { forgeToast } from "@/components/forge/toaster";
import { Button, Eyebrow, H1, Input } from "@/components/forge/ui";
import { renderPlantilla } from "@/domain/rules";
import type { PlantillaContext } from "@/domain/types";
import type { PlantillaDTO } from "@/lib/data/plantillas";
import { actualizarPlantillaAction, crearPlantillaAction } from "../actions";

const TOKENS = [
  "nombre",
  "clases",
  "paquete",
  "vence",
  "dias",
  "precios",
  "datos_pago",
  "negocio",
] as const satisfies ReadonlyArray<keyof PlantillaContext>;

/** A coherent, urgency-flavored sample persona so every {token} resolves to
 *  believable es-MX data. María bought an 8-clase package and has 1 class left
 *  (por vencer) — so "clases", "paquete", "vence" and "dias" all read together.
 *  Fixed constant on purpose: this is an EXAMPLE, never live client data. */
function sampleCtx(negocio: string): PlantillaContext {
  return {
    nombre: "María",
    clases: "1 clase",
    paquete: "8 clases",
    vence: "30 may",
    dias: "3 días",
    precios: "• 8 clases — $800\n• Ilimitado — $1,200",
    datos_pago: "Transferencia BBVA\nCLABE 012 320 00…",
    negocio: negocio || "FORGE",
  };
}

/** A faux WhatsApp "sent" bubble: green, self-colored (good in light + dark),
 *  rounded with a little tail, plus static decorative chrome (a fixed 9:41 time
 *  and double "read" ticks). The timestamp/ticks are purely cosmetic — a literal
 *  string, never `new Date()`, to avoid a hydration mismatch. */
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

export function PlantillaEditor({
  plantilla,
  negocio,
  onDone,
  onCancel,
}: {
  plantilla?: PlantillaDTO;
  negocio: string;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const isEdit = !!plantilla;
  const [nombre, setNombre] = React.useState(plantilla?.nombre ?? "");
  const [body, setBody] = React.useState(plantilla?.body ?? "");
  const [saving, setSaving] = React.useState(false);
  const bodyRef = React.useRef<HTMLTextAreaElement | null>(null);

  const valido =
    nombre.trim().length >= 1 && nombre.trim().length <= 40 && body.trim().length >= 1 && body.trim().length <= 1000;
  const dirty = !isEdit || nombre !== plantilla!.nombre || body !== plantilla!.body;
  const canSave = valido && dirty && !saving;

  const insertToken = (t: string) => {
    const tok = `{${t}}`;
    const el = bodyRef.current;
    if (!el) {
      setBody((b) => b + tok);
      return;
    }
    const start = el.selectionStart ?? body.length;
    const end = el.selectionEnd ?? body.length;
    setBody(body.slice(0, start) + tok + body.slice(end));
  };

  const guardar = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      if (isEdit) await actualizarPlantillaAction({ id: plantilla!.id, nombre, body });
      else await crearPlantillaAction({ nombre, body });
      forgeToast({ tone: "success", title: isEdit ? "Plantilla actualizada" : "Plantilla creada", body: nombre.trim() });
      router.refresh();
      onDone();
    } catch {
      forgeToast({ tone: "warning", title: "No se pudo guardar", body: "Intenta de nuevo." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div className="flex items-center" style={{ gap: 10, padding: "8px 22px 14px" }}>
        <button
          onClick={onCancel}
          aria-label="Atrás"
          className="flex items-center justify-center border border-line bg-surface"
          style={{ width: 34, height: 34, padding: 0, cursor: "pointer" }}
        >
          <Icon name="back" size={14} color="var(--muted)" />
        </button>
        <div>
          <Eyebrow color="var(--gold)">{isEdit ? "EDITAR" : "NUEVA"} PLANTILLA</Eyebrow>
          <H1 size={20} style={{ marginTop: 4 }}>
            {nombre.trim() || "Sin nombre"}
          </H1>
        </div>
      </div>

      <div className="flex flex-col" style={{ padding: "0 16px", gap: 18 }}>
        <label className="flex flex-col" style={{ gap: 8 }}>
          <Eyebrow style={{ paddingLeft: 2 }}>NOMBRE</Eyebrow>
          <Input placeholder="Ej. Bienvenida" value={nombre} onChange={setNombre} autoFocus />
        </label>

        <label className="flex flex-col" style={{ gap: 8 }}>
          <Eyebrow style={{ paddingLeft: 2 }}>MENSAJE</Eyebrow>
          <Textarea ref={bodyRef} placeholder="Hola {nombre}…" value={body} onChange={setBody} rows={6} />
        </label>

        <div className="flex flex-col" style={{ gap: 8, marginTop: -8 }}>
          <Eyebrow style={{ paddingLeft: 2 }}>INSERTAR DATO</Eyebrow>
          <div className="flex" style={{ flexWrap: "wrap", gap: 6 }}>
            {TOKENS.map((t) => (
              <button
                key={t}
                onClick={() => insertToken(t)}
                className="font-semibold transition-colors hover:border-yellow"
                style={{
                  padding: "5px 9px",
                  fontSize: 11,
                  letterSpacing: 0.3,
                  border: "1px solid var(--line)",
                  background: "var(--surface)",
                  color: "var(--muted)",
                  cursor: "pointer",
                }}
              >
                <span style={{ color: "var(--gold)" }}>{"{"}</span>
                {t}
                <span style={{ color: "var(--gold)" }}>{"}"}</span>
              </button>
            ))}
          </div>
        </div>

        <div>
          <Eyebrow>VISTA DE EJEMPLO</Eyebrow>
          <div style={{ marginTop: 8, border: "1px solid var(--line)" }}>
            {body.trim() ? (
              <WhatsappBubble>{renderPlantilla(body, sampleCtx(negocio))}</WhatsappBubble>
            ) : (
              <div
                style={{
                  padding: "18px 16px",
                  background: "var(--sunk)",
                  fontSize: 13,
                  fontStyle: "italic",
                  color: "var(--muted)",
                  textAlign: "center",
                }}
              >
                Escribe un mensaje para ver la vista previa…
              </div>
            )}
          </div>
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--line)", margin: "20px 0 0", padding: "20px 16px 4px" }}>
        <Button variant="primary" size="lg" full icon="check" disabled={!canSave} onClick={guardar}>
          {saving ? "GUARDANDO…" : isEdit ? "GUARDAR" : "CREAR"}
        </Button>
      </div>
    </div>
  );
}
