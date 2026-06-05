"use client";

import * as React from "react";
import { Icon } from "@/components/forge/icon";
import { Sheet } from "@/components/forge/sheet";
import { Eyebrow, H1, Tnum } from "@/components/forge/ui";
import type { PaqueteDTO } from "@/lib/data/paquetes";
import { pesos } from "@/lib/format";
import { PaqueteEditor } from "./paquete-editor";

// Edit existing only — no "new", no delete (locked scope). The view is just
// list ⇄ edit; tapping a row carries the chosen PaqueteDTO into the editor.
type View = { mode: "list" } | { mode: "edit"; paquete: PaqueteDTO };

export function PaquetesSheet({
  open,
  onClose,
  paquetes,
}: {
  open: boolean;
  onClose: () => void;
  paquetes: PaqueteDTO[];
}) {
  const [view, setView] = React.useState<View>({ mode: "list" });

  React.useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset to the list pane each time the sheet opens
    setView({ mode: "list" });
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose}>
      {view.mode === "list" ? (
        <>
          <div style={{ padding: "8px 22px 16px" }}>
            <Eyebrow color="var(--gold)">PAQUETES Y PRECIOS</Eyebrow>
            <H1 size={22} style={{ marginTop: 6 }}>
              PRECIOS GUARDADOS
            </H1>
            <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5, color: "var(--muted)" }}>
              Toca un paquete para cambiar su nombre, precio o la estrella de destacado.
            </div>
          </div>

          <div className="flex flex-col" style={{ padding: "0 16px", gap: 8 }}>
            {paquetes.map((p) => (
              <button
                key={p.id}
                onClick={() => setView({ mode: "edit", paquete: p })}
                className="forge-pressable flex w-full items-center border border-line bg-surface text-left"
                style={{ gap: 12, padding: "14px 16px", cursor: "pointer", color: "var(--fg)" }}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center" style={{ gap: 7 }}>
                    <div className="uppercase font-bold" style={{ fontSize: 13, letterSpacing: 0.5 }}>
                      {p.nombre?.trim() || "Sin nombre"}
                    </div>
                    {p.popular && <Icon name="star" size={12} color="var(--gold)" />}
                  </div>
                </div>
                <div className="flex shrink-0 items-center" style={{ gap: 12 }}>
                  <Tnum className="font-extrabold" style={{ fontSize: 16 }}>
                    {pesos(p.precio)}
                  </Tnum>
                  <Icon name="chev" size={13} color="var(--muted-soft)" />
                </div>
              </button>
            ))}
          </div>
        </>
      ) : (
        <PaqueteEditor paquete={view.paquete} onDone={() => setView({ mode: "list" })} />
      )}
    </Sheet>
  );
}
