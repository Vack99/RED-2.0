"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@gym/ui/forge/icon";
import { Textarea } from "@gym/ui/forge/input";
import { forgeToast } from "@gym/ui/forge/toaster";
import { Button, Eyebrow, H1, Input } from "@gym/ui/forge/ui";
import type { CoachDTO } from "@gym/data/server/coach";
import { actualizarCoachAction, crearCoachAction } from "../actions";

export function CoachEditor({
  coach,
  onDone,
  onCancel,
}: {
  coach?: CoachDTO;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const isEdit = !!coach;
  const [nombre, setNombre] = React.useState(coach?.nombre ?? "");
  const [iniciales, setIniciales] = React.useState(coach?.iniciales ?? "");
  const [rol, setRol] = React.useState(coach?.rol ?? "");
  const [especialidad, setEspecialidad] = React.useState(coach?.especialidad ?? "");
  const [bio, setBio] = React.useState(coach?.bio ?? "");
  const [saving, setSaving] = React.useState(false);

  const valido =
    nombre.trim().length >= 1 &&
    nombre.trim().length <= 80 &&
    iniciales.trim().length >= 1 &&
    iniciales.trim().length <= 4 &&
    rol.trim().length >= 1 &&
    rol.trim().length <= 60;
  const dirty =
    !isEdit ||
    nombre !== coach!.nombre ||
    iniciales !== coach!.iniciales ||
    rol !== coach!.rol ||
    especialidad !== (coach!.especialidad ?? "") ||
    bio !== (coach!.bio ?? "");
  const canSave = valido && dirty && !saving;

  const guardar = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload = { nombre, iniciales, rol, especialidad, bio };
      if (isEdit) await actualizarCoachAction({ id: coach!.id, ...payload });
      else await crearCoachAction(payload);
      forgeToast({ tone: "success", title: isEdit ? "Coach actualizado" : "Coach creado", body: nombre.trim() });
      router.refresh();
      onDone();
    } catch (e) {
      forgeToast({
        tone: "warning",
        title: "No se pudo guardar",
        body: e instanceof Error ? e.message : "Intenta de nuevo.",
      });
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
          className="forge-hit forge-pressable flex items-center justify-center border border-line bg-surface"
          style={{ width: 34, height: 34, padding: 0, cursor: "pointer" }}
        >
          <Icon name="back" size={14} color="var(--muted)" />
        </button>
        <div className="min-w-0 flex-1">
          <Eyebrow color="var(--gold)">{isEdit ? "EDITAR" : "NUEVO"} COACH</Eyebrow>
          <H1 size={20} style={{ marginTop: 4 }}>
            {nombre.trim() || "Sin nombre"}
          </H1>
        </div>
      </div>

      <div className="flex flex-col" style={{ padding: "0 16px", gap: 18 }}>
        <label className="flex flex-col" style={{ gap: 8 }}>
          <Eyebrow style={{ paddingLeft: 2 }}>NOMBRE</Eyebrow>
          <Input placeholder="Ej. Marisa González" value={nombre} onChange={setNombre} autoFocus />
        </label>

        <label className="flex flex-col" style={{ gap: 8 }}>
          <Eyebrow style={{ paddingLeft: 2 }}>INICIALES</Eyebrow>
          <Input placeholder="Ej. MG" value={iniciales} onChange={(v) => setIniciales(v.toUpperCase())} />
        </label>

        <label className="flex flex-col" style={{ gap: 8 }}>
          <Eyebrow style={{ paddingLeft: 2 }}>ROL</Eyebrow>
          <Input placeholder="Ej. Head coach" value={rol} onChange={setRol} />
        </label>

        <label className="flex flex-col" style={{ gap: 8 }}>
          <Eyebrow style={{ paddingLeft: 2 }}>ESPECIALIDAD</Eyebrow>
          <Input placeholder="Ej. CrossFit" value={especialidad} onChange={setEspecialidad} />
        </label>

        <label className="flex flex-col" style={{ gap: 8 }}>
          <Eyebrow style={{ paddingLeft: 2 }}>BIO</Eyebrow>
          <Textarea placeholder="Una breve reseña…" value={bio} onChange={setBio} rows={4} />
        </label>
      </div>

      <div style={{ borderTop: "1px solid var(--line)", margin: "20px 0 0", padding: "20px 16px 4px" }}>
        <Button variant="primary" size="lg" full icon="check" disabled={!canSave} onClick={guardar}>
          {saving ? "GUARDANDO…" : isEdit ? "GUARDAR" : "CREAR"}
        </Button>
      </div>
    </div>
  );
}
