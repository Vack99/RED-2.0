"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@gym/ui/forge/icon";
import { Sheet } from "@gym/ui/forge/sheet";
import { forgeToast } from "@gym/ui/forge/toaster";
import { Button, Eyebrow, H1 } from "@gym/ui/forge/ui";
import type { CoachDTO } from "@gym/data/server/coach";
import { establecerCoachActivoAction, reordenarCoachesAction } from "../actions";
import { CoachEditor } from "./coach-editor";

type View = { mode: "list" } | { mode: "edit"; coach: CoachDTO } | { mode: "new" };

export function CoachesSheet({
  open,
  onClose,
  coaches,
}: {
  open: boolean;
  onClose: () => void;
  coaches: CoachDTO[];
}) {
  const router = useRouter();
  const [view, setView] = React.useState<View>({ mode: "list" });

  React.useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset to the list pane each time the sheet opens
    setView({ mode: "list" });
  }, [open]);

  const mover = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= coaches.length) return;
    const ids = coaches.map((c) => c.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
      await reordenarCoachesAction({ ids });
      router.refresh();
    } catch {
      forgeToast({ tone: "warning", title: "No se pudo reordenar" });
    }
  };

  const toggleActivo = async (c: CoachDTO) => {
    try {
      await establecerCoachActivoAction({ id: c.id, activo: !c.activo });
      forgeToast({ tone: "success", title: c.activo ? "Coach desactivado" : "Coach activado", body: c.nombre });
      router.refresh();
    } catch {
      forgeToast({ tone: "warning", title: "No se pudo actualizar" });
    }
  };

  return (
    <Sheet open={open} onClose={onClose}>
      {view.mode === "list" ? (
        <>
          <div style={{ padding: "8px 22px 16px" }}>
            <Eyebrow color="var(--gold)">COACHES</Eyebrow>
            <H1 size={22} style={{ marginTop: 6 }}>
              EQUIPO
            </H1>
            <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5, color: "var(--muted)" }}>
              Un coach desactivado desaparece de los selectores nuevos, pero sigue apareciendo en las clases ya agendadas.
            </div>
          </div>

          <div className="flex flex-col" style={{ padding: "0 16px", gap: 8 }}>
            {coaches.length === 0 ? (
              <div
                className="flex flex-col items-center"
                style={{ gap: 10, border: "1px dashed var(--line)", background: "var(--surface)", padding: "26px 16px", textAlign: "center" }}
              >
                <Icon name="users" size={22} color="var(--muted-soft)" />
                <div style={{ fontSize: 12.5, color: "var(--muted)", lineHeight: 1.5 }}>
                  Aún no tienes coaches. Agrega el primero.
                </div>
              </div>
            ) : (
              coaches.map((c, i) => (
                <div
                  key={c.id}
                  className="flex items-center"
                  style={{
                    gap: 10,
                    border: "1px solid var(--line)",
                    background: "var(--surface)",
                    padding: "12px 8px 12px 14px",
                    opacity: c.activo ? 1 : 0.55,
                  }}
                >
                  <button
                    onClick={() => setView({ mode: "edit", coach: c })}
                    className="flex min-w-0 flex-1 items-center"
                    style={{ gap: 12, textAlign: "left", background: "transparent", border: "none", cursor: "pointer" }}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="uppercase font-bold" style={{ fontSize: 12.5, letterSpacing: 0.6, color: "var(--fg)" }}>
                        {c.nombre}
                      </div>
                      <div style={{ marginTop: 3, fontSize: 11, color: "var(--muted)" }}>
                        {c.rol}
                        {!c.activo && " · INACTIVO"}
                      </div>
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center" style={{ gap: 2 }}>
                    <button
                      onClick={() => mover(i, -1)}
                      disabled={i === 0}
                      aria-label="Mover arriba"
                      className="forge-hit flex items-center justify-center"
                      style={{ width: 28, height: 28, background: "transparent", border: "none", cursor: i === 0 ? "default" : "pointer", opacity: i === 0 ? 0.3 : 1 }}
                    >
                      <Icon name="chevD" size={14} color="var(--muted)" className="rotate-180" />
                    </button>
                    <button
                      onClick={() => mover(i, 1)}
                      disabled={i === coaches.length - 1}
                      aria-label="Mover abajo"
                      className="forge-hit flex items-center justify-center"
                      style={{
                        width: 28,
                        height: 28,
                        background: "transparent",
                        border: "none",
                        cursor: i === coaches.length - 1 ? "default" : "pointer",
                        opacity: i === coaches.length - 1 ? 0.3 : 1,
                      }}
                    >
                      <Icon name="chevD" size={14} color="var(--muted)" />
                    </button>
                    <button
                      onClick={() => toggleActivo(c)}
                      aria-label={c.activo ? "Desactivar" : "Activar"}
                      className="forge-hit forge-pressable flex items-center justify-center"
                      style={{ width: 28, height: 28, background: "transparent", border: "none", cursor: "pointer" }}
                    >
                      {/* Icon shows the ACTION a tap takes, not the current state: X to
                          deactivate an active coach, check to reactivate an inactive one. */}
                      <Icon name={c.activo ? "close" : "check"} size={14} color={c.activo ? "var(--red)" : "var(--green)"} />
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>

          <div style={{ borderTop: "1px solid var(--line)", margin: "20px 0 0", padding: "20px 16px 4px" }}>
            <Button variant="secondary" size="lg" full icon="plus" onClick={() => setView({ mode: "new" })}>
              AGREGAR COACH
            </Button>
          </div>
        </>
      ) : (
        <CoachEditor
          coach={view.mode === "edit" ? view.coach : undefined}
          onDone={() => setView({ mode: "list" })}
          onCancel={() => setView({ mode: "list" })}
        />
      )}
    </Sheet>
  );
}
