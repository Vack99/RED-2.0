"use client";

import * as React from "react";
import { Icon } from "@gym/ui/forge/icon";
import { Sheet } from "@gym/ui/forge/sheet";
import { Button, Eyebrow, H1 } from "@gym/ui/forge/ui";
import type { ClassTypeDTO } from "@gym/data/server/class-type";
import { ClassTypeEditor } from "./class-type-editor";

type View = { mode: "list" } | { mode: "edit"; id: string } | { mode: "new" };

export function ClassTypesSheet({
  open,
  onClose,
  classTypes,
}: {
  open: boolean;
  onClose: () => void;
  classTypes: ClassTypeDTO[];
}) {
  const [view, setView] = React.useState<View>({ mode: "list" });

  React.useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset to the list pane each time the sheet opens
    setView({ mode: "list" });
  }, [open]);

  // Re-derived from the (possibly refreshed) `classTypes` prop every render —
  // NOT captured once in state — so a bloques/porTraer edit inside the editor
  // (which router.refresh()es) shows the fresh children without leaving edit mode.
  const editing = view.mode === "edit" ? classTypes.find((c) => c.id === view.id) : undefined;

  return (
    <Sheet open={open} onClose={onClose}>
      {view.mode === "list" ? (
        <>
          <div style={{ padding: "8px 22px 16px" }}>
            <Eyebrow color="var(--gold)">TIPOS DE CLASE</Eyebrow>
            <H1 size={22} style={{ marginTop: 6 }}>
              CATÁLOGO DE CLASES
            </H1>
            <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5, color: "var(--muted)" }}>
              Toca un tipo de clase para editar su sala, nivel, descripción y listas.
            </div>
          </div>

          <div className="flex flex-col" style={{ padding: "0 16px", gap: 8 }}>
            {classTypes.length === 0 ? (
              <div
                className="flex flex-col items-center"
                style={{ gap: 10, border: "1px dashed var(--line)", background: "var(--surface)", padding: "26px 16px", textAlign: "center" }}
              >
                <Icon name="flame" size={22} color="var(--muted-soft)" />
                <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>
                  Aún no tienes tipos de clase. Agrega el primero.
                </div>
              </div>
            ) : (
              classTypes.map((ct) => (
                <button
                  key={ct.id}
                  onClick={() => setView({ mode: "edit", id: ct.id })}
                  className="forge-pressable flex w-full items-center border border-line bg-surface text-left"
                  style={{ gap: 12, padding: "14px 16px", cursor: "pointer", color: "var(--fg)" }}
                >
                  <div className="min-w-0 flex-1">
                    <div className="uppercase font-bold" style={{ fontSize: 13, letterSpacing: 0.5 }}>{ct.nombre}</div>
                    <div style={{ marginTop: 3, fontSize: 11, color: "var(--muted)" }}>
                      {[ct.sala, ct.nivel, ct.duracionMin ? `${ct.duracionMin} min` : null].filter(Boolean).join(" · ") || "Sin detalles"}
                    </div>
                  </div>
                  <Icon name="chev" size={13} color="var(--muted-soft)" />
                </button>
              ))
            )}
          </div>

          <div style={{ borderTop: "1px solid var(--line)", margin: "20px 0 0", padding: "20px 16px 4px" }}>
            <Button variant="secondary" size="lg" full icon="plus" onClick={() => setView({ mode: "new" })}>
              AGREGAR TIPO DE CLASE
            </Button>
          </div>
        </>
      ) : (
        <ClassTypeEditor
          classType={editing}
          onDone={() => setView({ mode: "list" })}
          onCancel={() => setView({ mode: "list" })}
        />
      )}
    </Sheet>
  );
}
