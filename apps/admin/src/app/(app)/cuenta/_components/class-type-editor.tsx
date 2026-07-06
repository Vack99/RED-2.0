"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@gym/ui/forge/icon";
import { Textarea } from "@gym/ui/forge/input";
import { forgeToast } from "@gym/ui/forge/toaster";
import { Button, Eyebrow, H1, Input } from "@gym/ui/forge/ui";
import type { ClassTypeDTO, ClassTypeItemDTO } from "@gym/data/server/class-type";
import {
  actualizarBloqueAction,
  actualizarClassTypeAction,
  actualizarPorTraerAction,
  crearBloqueAction,
  crearClassTypeAction,
  crearPorTraerAction,
  reordenarBloquesAction,
  reordenarPorTraerAction,
} from "../actions";

type ItemKind = "bloques" | "porTraer";

const ITEM_ACTIONS: Record<
  ItemKind,
  {
    crear: typeof crearBloqueAction;
    actualizar: typeof actualizarBloqueAction;
    reordenar: typeof reordenarBloquesAction;
  }
> = {
  bloques: { crear: crearBloqueAction, actualizar: actualizarBloqueAction, reordenar: reordenarBloquesAction },
  porTraer: { crear: crearPorTraerAction, actualizar: actualizarPorTraerAction, reordenar: reordenarPorTraerAction },
};

/** One reorderable, inline-editable row. Commits a label edit on blur (only if
 *  it actually changed) — matches the coach roster's "act immediately, refresh"
 *  pattern (no separate save step for a single row). */
function ItemRow({
  item,
  kind,
  onMove,
  disableUp,
  disableDown,
}: {
  item: ClassTypeItemDTO;
  kind: ItemKind;
  onMove: (dir: -1 | 1) => void;
  disableUp: boolean;
  disableDown: boolean;
}) {
  const router = useRouter();
  const [etiqueta, setEtiqueta] = React.useState(item.etiqueta);

  const commit = async () => {
    const next = etiqueta.trim();
    if (!next || next === item.etiqueta) {
      setEtiqueta(item.etiqueta);
      return;
    }
    try {
      await ITEM_ACTIONS[kind].actualizar({ id: item.id, etiqueta: next });
      router.refresh();
    } catch {
      forgeToast({ tone: "warning", title: "No se pudo actualizar" });
      setEtiqueta(item.etiqueta);
    }
  };

  return (
    <div className="flex items-center" style={{ gap: 6, border: "1px solid var(--line)", background: "var(--surface)", padding: "6px 6px 6px 10px" }}>
      <input
        value={etiqueta}
        onChange={(e) => setEtiqueta(e.target.value)}
        onBlur={commit}
        className="min-w-0 flex-1 border-none bg-transparent outline-none"
        style={{ color: "var(--fg)", fontSize: 13, padding: "6px 4px" }}
      />
      <button
        onClick={() => onMove(-1)}
        disabled={disableUp}
        aria-label="Mover arriba"
        className="forge-hit flex items-center justify-center"
        style={{ width: 26, height: 26, background: "transparent", border: "none", cursor: disableUp ? "default" : "pointer", opacity: disableUp ? 0.3 : 1 }}
      >
        <Icon name="chevD" size={12} color="var(--muted)" className="rotate-180" />
      </button>
      <button
        onClick={() => onMove(1)}
        disabled={disableDown}
        aria-label="Mover abajo"
        className="forge-hit flex items-center justify-center"
        style={{ width: 26, height: 26, background: "transparent", border: "none", cursor: disableDown ? "default" : "pointer", opacity: disableDown ? 0.3 : 1 }}
      >
        <Icon name="chevD" size={12} color="var(--muted)" />
      </button>
    </div>
  );
}

/** The ordered-list editor shared by bloques (workblocks) and porTraer (bring
 *  items) — identical shape and action set, one component serves both real
 *  call sites. No delete (matches #37's migration — no delete RLS policy on
 *  either child table). */
function ItemListSection({
  title,
  placeholder,
  classTypeId,
  items,
  kind,
}: {
  title: string;
  placeholder: string;
  classTypeId: string;
  items: ClassTypeItemDTO[];
  kind: ItemKind;
}) {
  const router = useRouter();
  const [nuevo, setNuevo] = React.useState("");
  const [adding, setAdding] = React.useState(false);

  const mover = async (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= items.length) return;
    const ids = items.map((it) => it.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    try {
      await ITEM_ACTIONS[kind].reordenar({ ids });
      router.refresh();
    } catch {
      forgeToast({ tone: "warning", title: "No se pudo reordenar" });
    }
  };

  const agregar = async () => {
    const etiqueta = nuevo.trim();
    if (!etiqueta || adding) return;
    setAdding(true);
    try {
      await ITEM_ACTIONS[kind].crear({ classTypeId, etiqueta, orden: items.length });
      setNuevo("");
      router.refresh();
    } catch {
      forgeToast({ tone: "warning", title: "No se pudo agregar" });
    } finally {
      setAdding(false);
    }
  };

  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      <Eyebrow style={{ paddingLeft: 2 }}>{title}</Eyebrow>
      {items.map((item, i) => (
        <ItemRow
          key={item.id}
          item={item}
          kind={kind}
          onMove={(dir) => mover(i, dir)}
          disableUp={i === 0}
          disableDown={i === items.length - 1}
        />
      ))}
      <div className="flex items-center" style={{ gap: 8 }}>
        <Input placeholder={placeholder} value={nuevo} onChange={setNuevo} />
        <button
          onClick={agregar}
          disabled={!nuevo.trim() || adding}
          aria-label="Agregar"
          className="forge-hit forge-pressable flex shrink-0 items-center justify-center border border-line bg-surface"
          style={{ width: 44, height: 44, cursor: !nuevo.trim() || adding ? "not-allowed" : "pointer", opacity: !nuevo.trim() || adding ? 0.4 : 1 }}
        >
          <Icon name="plus" size={16} color="var(--gold)" />
        </button>
      </div>
    </div>
  );
}

/** Parse the duration field to a positive integer (minutes), or null when
 *  blank — mirrors PaqueteEditor's parsePrecio (whole numbers only, empty ⇒ no default). */
function parseDuracion(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const n = Number(trimmed);
  return Number.isInteger(n) && n > 0 ? n : NaN;
}

export function ClassTypeEditor({
  classType,
  onDone,
  onCancel,
}: {
  classType?: ClassTypeDTO;
  onDone: () => void;
  onCancel: () => void;
}) {
  const router = useRouter();
  const isEdit = !!classType;
  const [nombre, setNombre] = React.useState(classType?.nombre ?? "");
  const [sala, setSala] = React.useState(classType?.sala ?? "");
  const [nivel, setNivel] = React.useState(classType?.nivel ?? "");
  const [descripcion, setDescripcion] = React.useState(classType?.descripcion ?? "");
  const [duracionStr, setDuracionStr] = React.useState(classType?.duracionMin ? String(classType.duracionMin) : "");
  const [saving, setSaving] = React.useState(false);

  const duracion = parseDuracion(duracionStr);
  const valido = nombre.trim().length >= 1 && nombre.trim().length <= 60 && !Number.isNaN(duracion);
  const dirty =
    !isEdit ||
    nombre !== classType!.nombre ||
    sala !== (classType!.sala ?? "") ||
    nivel !== (classType!.nivel ?? "") ||
    descripcion !== (classType!.descripcion ?? "") ||
    duracion !== classType!.duracionMin;
  const canSave = valido && dirty && !saving;

  const guardar = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const payload = { nombre, sala, nivel, descripcion, duracionMin: duracion };
      if (isEdit) await actualizarClassTypeAction({ id: classType!.id, ...payload });
      else await crearClassTypeAction(payload);
      forgeToast({ tone: "success", title: isEdit ? "Tipo de clase actualizado" : "Tipo de clase creado", body: nombre.trim() });
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
          <Eyebrow color="var(--gold)">{isEdit ? "EDITAR" : "NUEVO"} TIPO DE CLASE</Eyebrow>
          <H1 size={20} style={{ marginTop: 4 }}>
            {nombre.trim() || "Sin nombre"}
          </H1>
        </div>
      </div>

      <div className="flex flex-col" style={{ padding: "0 16px", gap: 18 }}>
        <label className="flex flex-col" style={{ gap: 8 }}>
          <Eyebrow style={{ paddingLeft: 2 }}>NOMBRE</Eyebrow>
          <Input placeholder="Ej. CrossFit" value={nombre} onChange={setNombre} autoFocus />
        </label>

        <label className="flex flex-col" style={{ gap: 8 }}>
          <Eyebrow style={{ paddingLeft: 2 }}>SALA</Eyebrow>
          <Input placeholder="Ej. Sala A" value={sala} onChange={setSala} />
        </label>

        <label className="flex flex-col" style={{ gap: 8 }}>
          <Eyebrow style={{ paddingLeft: 2 }}>NIVEL</Eyebrow>
          <Input placeholder="Ej. Intermedio" value={nivel} onChange={setNivel} />
        </label>

        <label className="flex flex-col" style={{ gap: 8 }}>
          <Eyebrow style={{ paddingLeft: 2 }}>DESCRIPCIÓN</Eyebrow>
          <Textarea placeholder="De qué se trata esta clase…" value={descripcion} onChange={setDescripcion} rows={3} />
        </label>

        <label className="flex flex-col" style={{ gap: 8 }}>
          <Eyebrow style={{ paddingLeft: 2 }}>DURACIÓN</Eyebrow>
          <Input placeholder="45" value={duracionStr} onChange={setDuracionStr} suffix="MIN" inputMode="numeric" />
          {Number.isNaN(duracion) && (
            <span style={{ paddingLeft: 2, fontSize: 11, color: "var(--red)" }}>Minutos enteros, o vacío</span>
          )}
        </label>
      </div>

      <div style={{ borderTop: "1px solid var(--line)", margin: "20px 0 0", padding: "20px 16px 4px" }}>
        <Button variant="primary" size="lg" full icon="check" disabled={!canSave} onClick={guardar}>
          {saving ? "GUARDANDO…" : isEdit ? "GUARDAR" : "CREAR"}
        </Button>
      </div>

      {/* Children only apply to an existing class type — creating one here
          first, then re-entering edit to curate bloques/porTraer, keeps
          creation a single atomic write (no orphaned-children edge case). */}
      {isEdit && (
        <div className="flex flex-col" style={{ padding: "20px 16px 4px", gap: 20, borderTop: "1px solid var(--line)", marginTop: 20 }}>
          <ItemListSection
            title="BLOQUES DE TRABAJO"
            placeholder="Ej. Calentamiento"
            classTypeId={classType!.id}
            items={classType!.bloques}
            kind="bloques"
          />
          <ItemListSection
            title="QUÉ TRAER"
            placeholder="Ej. Toalla"
            classTypeId={classType!.id}
            items={classType!.porTraer}
            kind="porTraer"
          />
        </div>
      )}
    </div>
  );
}
