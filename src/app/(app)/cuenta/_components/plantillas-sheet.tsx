"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@gym/ui/forge/icon";
import { Sheet } from "@gym/ui/forge/sheet";
import { forgeToast } from "@gym/ui/forge/toaster";
import { Button, Eyebrow, H1 } from "@gym/ui/forge/ui";
import type { PlantillaDTO } from "@/lib/data/plantillas";
import { eliminarPlantillaAction, sembrarPlantillasDefaultAction } from "../actions";
import { PlantillaEditor } from "./plantilla-editor";

type View = { mode: "list" } | { mode: "edit"; plantilla: PlantillaDTO } | { mode: "new" };

export function PlantillasSheet({
  open,
  onClose,
  plantillas,
  negocio,
}: {
  open: boolean;
  onClose: () => void;
  plantillas: PlantillaDTO[];
  negocio: string;
}) {
  const router = useRouter();
  const [view, setView] = React.useState<View>({ mode: "list" });
  const seededRef = React.useRef(false);

  React.useEffect(() => {
    if (!open) {
      seededRef.current = false;
      return;
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset to the list pane each time the sheet opens
    setView({ mode: "list" });
    if (plantillas.length === 0 && !seededRef.current) {
      seededRef.current = true;
      sembrarPlantillasDefaultAction()
        .then(() => router.refresh())
        .catch(() => forgeToast({ tone: "warning", title: "No se pudieron crear las predeterminadas" }));
    }
  }, [open, plantillas.length, router]);

  const borrar = async (p: PlantillaDTO) => {
    if (!window.confirm(`¿Eliminar "${p.nombre}"?`)) return;
    try {
      await eliminarPlantillaAction({ id: p.id });
      forgeToast({ tone: "success", title: "Plantilla eliminada", body: p.nombre });
      router.refresh();
    } catch {
      forgeToast({ tone: "warning", title: "No se pudo eliminar", body: "Intenta de nuevo." });
    }
  };

  return (
    <Sheet open={open} onClose={onClose}>
      {view.mode === "list" ? (
        <>
          <div style={{ padding: "8px 22px 16px" }}>
            <div className="flex items-center" style={{ gap: 8 }}>
              <Eyebrow color="var(--gold)">PLANTILLAS DE WHATSAPP</Eyebrow>
              <span
                className="tnum"
                style={{ fontSize: 10, fontWeight: 700, letterSpacing: 1, color: "var(--muted)" }}
              >
                {plantillas.length}/4
              </span>
            </div>
            <H1 size={22} style={{ marginTop: 6 }}>
              MENSAJES GUARDADOS
            </H1>
            <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5, color: "var(--muted)" }}>
              Edita los mensajes que mandas por WhatsApp. Toca uno para ajustar su texto.
            </div>
          </div>

          <div className="flex flex-col" style={{ padding: "0 16px", gap: 8 }}>
            {plantillas.length === 0 ? (
              <div
                className="flex flex-col items-center"
                style={{
                  gap: 10,
                  border: "1px dashed var(--line)",
                  background: "var(--surface)",
                  padding: "26px 16px",
                  textAlign: "center",
                }}
              >
                <Icon name="wa" size={22} color="var(--muted-soft)" />
                <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>
                  Preparando tus plantillas predeterminadas…
                </div>
              </div>
            ) : (
              plantillas.map((p) => (
                <div
                  key={p.id}
                  className="flex items-center"
                  style={{ gap: 12, border: "1px solid var(--line)", background: "var(--surface)", padding: "12px 8px 12px 14px" }}
                >
                  <button
                    onClick={() => setView({ mode: "edit", plantilla: p })}
                    className="flex min-w-0 flex-1 items-center"
                    style={{ gap: 12, textAlign: "left", background: "transparent", border: "none", cursor: "pointer" }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="uppercase font-bold" style={{ fontSize: 12.5, letterSpacing: 0.6, color: "var(--fg)" }}>
                        {p.nombre}
                      </div>
                      <div
                        style={{
                          marginTop: 4,
                          fontSize: 12,
                          color: "var(--muted)",
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {p.body}
                      </div>
                    </div>
                    <Icon name="chev" size={13} color="var(--muted-soft)" />
                  </button>
                  <button
                    onClick={() => borrar(p)}
                    aria-label="Eliminar"
                    className="forge-hit forge-pressable flex shrink-0 items-center justify-center"
                    style={{ width: 32, height: 32, background: "transparent", border: "none", cursor: "pointer" }}
                  >
                    <Icon name="trash" size={15} color="var(--muted)" />
                  </button>
                </div>
              ))
            )}
          </div>

          <div style={{ borderTop: "1px solid var(--line)", margin: "20px 0 0", padding: "20px 16px 4px" }}>
            <Button
              variant="secondary"
              size="lg"
              full
              icon="plus"
              disabled={plantillas.length >= 4}
              onClick={() => setView({ mode: "new" })}
            >
              {plantillas.length >= 4 ? "MÁXIMO 4 PLANTILLAS" : "AGREGAR PLANTILLA"}
            </Button>
          </div>
        </>
      ) : (
        <PlantillaEditor
          plantilla={view.mode === "edit" ? view.plantilla : undefined}
          negocio={negocio}
          onDone={() => setView({ mode: "list" })}
          onCancel={() => setView({ mode: "list" })}
        />
      )}
    </Sheet>
  );
}
