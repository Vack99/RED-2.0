"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@gym/ui/forge/icon";
import { Textarea } from "@gym/ui/forge/input";
import { Sheet } from "@gym/ui/forge/sheet";
import { forgeToast } from "@gym/ui/forge/toaster";
import { Button, Eyebrow, H1, Input } from "@gym/ui/forge/ui";
import type { AboutValueDTO } from "@gym/data/server/about-values";
import type { FacilityDTO } from "@gym/data/server/facilities";
import type { FaqDTO } from "@gym/data/server/faqs";
import type { StatDTO } from "@gym/data/server/stats";
import {
  actualizarAboutValueAction,
  actualizarFacilityAction,
  actualizarFaqAction,
  actualizarStatAction,
  crearAboutValueAction,
  crearFacilityAction,
  crearFaqAction,
  crearStatAction,
  eliminarAboutValueAction,
  eliminarFacilityAction,
  eliminarFaqAction,
  eliminarStatAction,
  reordenarAboutValuesAction,
  reordenarFacilitiesAction,
  reordenarFaqsAction,
  reordenarStatsAction,
} from "../actions";

/** The four "acerca de" content types the operator authors here — the Phase-6
 *  client app's nosotros/marketing pages render exactly these tables (PRD #36 S3). */
type Tab = "valores" | "instalaciones" | "stats" | "faq";

const TABS: { id: Tab; label: string }[] = [
  { id: "valores", label: "VALORES" },
  { id: "instalaciones", label: "INSTALACIONES" },
  { id: "stats", label: "STATS" },
  { id: "faq", label: "FAQ" },
];

export function GymContentSheet({
  open,
  onClose,
  aboutValues,
  facilities,
  stats,
  faqs,
}: {
  open: boolean;
  onClose: () => void;
  aboutValues: AboutValueDTO[];
  facilities: FacilityDTO[];
  stats: StatDTO[];
  faqs: FaqDTO[];
}) {
  const [tab, setTab] = React.useState<Tab>("valores");

  React.useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional reset to the first tab each time the sheet opens
    setTab("valores");
  }, [open]);

  return (
    <Sheet open={open} onClose={onClose}>
      <div style={{ padding: "8px 22px 14px" }}>
        <Eyebrow color="var(--gold)">CONTENIDO DEL GIMNASIO</Eyebrow>
        <H1 size={22} style={{ marginTop: 6 }}>
          NOSOTROS Y PREGUNTAS
        </H1>
        <div style={{ marginTop: 8, fontSize: 12, lineHeight: 1.5, color: "var(--muted)" }}>
          Esto es lo que verán tus miembros en la sección &ldquo;nosotros&rdquo; de la app.
        </div>
      </div>

      <div className="flex" style={{ gap: 6, padding: "0 16px 14px", flexWrap: "wrap" }}>
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className="forge-pressable font-extrabold uppercase"
            style={{
              padding: "9px 12px",
              fontSize: 10.5,
              letterSpacing: 0.8,
              border: `1px solid ${tab === t.id ? "var(--yellow)" : "var(--line)"}`,
              background: tab === t.id ? "var(--yellow)" : "var(--surface)",
              color: tab === t.id ? "var(--ink)" : "var(--muted)",
              cursor: "pointer",
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "valores" && <AboutValuesPane items={aboutValues} />}
      {tab === "instalaciones" && <FacilitiesPane items={facilities} />}
      {tab === "stats" && <StatsPane items={stats} />}
      {tab === "faq" && <FaqsPane items={faqs} />}
    </Sheet>
  );
}

/** Reorder every list the same way: swap the tapped row with its neighbor, then
 *  persist the FULL new id order in one call. Never a partial/implicit order. */
function swapped<T>(items: T[], index: number, delta: -1 | 1): T[] {
  const next = items.slice();
  const j = index + delta;
  [next[index], next[j]] = [next[j], next[index]];
  return next;
}

function ReorderButtons({ onUp, onDown, canUp, canDown }: { onUp: () => void; onDown: () => void; canUp: boolean; canDown: boolean }) {
  return (
    <div className="flex flex-col" style={{ gap: 2 }}>
      <button
        onClick={onUp}
        disabled={!canUp}
        aria-label="Subir"
        className="forge-hit flex items-center justify-center"
        style={{ width: 22, height: 18, background: "transparent", border: "none", cursor: canUp ? "pointer" : "default", opacity: canUp ? 1 : 0.3 }}
      >
        <span className="flex items-center justify-center" style={{ transform: "rotate(180deg)" }}>
          <Icon name="chevD" size={13} color="var(--muted)" />
        </span>
      </button>
      <button
        onClick={onDown}
        disabled={!canDown}
        aria-label="Bajar"
        className="forge-hit flex items-center justify-center"
        style={{ width: 22, height: 18, background: "transparent", border: "none", cursor: canDown ? "pointer" : "default", opacity: canDown ? 1 : 0.3 }}
      >
        <Icon name="chevD" size={13} color="var(--muted)" />
      </button>
    </div>
  );
}

// ── VALORES ─────────────────────────────────────────────────────────────────
type ValoresView = { mode: "list" } | { mode: "edit"; item: AboutValueDTO } | { mode: "new" };

function AboutValuesPane({ items }: { items: AboutValueDTO[] }) {
  const router = useRouter();
  const [view, setView] = React.useState<ValoresView>({ mode: "list" });

  const mover = async (index: number, delta: -1 | 1) => {
    const next = swapped(items, index, delta);
    try {
      await reordenarAboutValuesAction({ ids: next.map((v) => v.id) });
      router.refresh();
    } catch {
      forgeToast({ tone: "warning", title: "No se pudo reordenar" });
    }
  };

  const borrar = async (v: AboutValueDTO) => {
    if (!window.confirm(`¿Eliminar "${v.title}"?`)) return;
    try {
      await eliminarAboutValueAction({ id: v.id });
      forgeToast({ tone: "success", title: "Valor eliminado", body: v.title });
      router.refresh();
    } catch {
      forgeToast({ tone: "warning", title: "No se pudo eliminar" });
    }
  };

  if (view.mode !== "list") {
    return (
      <AboutValueEditor
        item={view.mode === "edit" ? view.item : undefined}
        onDone={() => setView({ mode: "list" })}
      />
    );
  }

  return (
    <div className="flex flex-col" style={{ padding: "0 16px", gap: 8 }}>
      {items.length === 0 && <EmptyRow label="Sin valores todavía" />}
      {items.map((v, i) => (
        <ContentRow
          key={v.id}
          title={v.title}
          sub={v.description}
          onEdit={() => setView({ mode: "edit", item: v })}
          onDelete={() => borrar(v)}
          reorder={<ReorderButtons onUp={() => mover(i, -1)} onDown={() => mover(i, 1)} canUp={i > 0} canDown={i < items.length - 1} />}
        />
      ))}
      <div style={{ marginTop: 10 }}>
        <Button variant="secondary" size="lg" full icon="plus" onClick={() => setView({ mode: "new" })}>
          AGREGAR VALOR
        </Button>
      </div>
    </div>
  );
}

function AboutValueEditor({ item, onDone }: { item?: AboutValueDTO; onDone: () => void }) {
  const router = useRouter();
  const isEdit = !!item;
  const [title, setTitle] = React.useState(item?.title ?? "");
  const [description, setDescription] = React.useState(item?.description ?? "");
  const [saving, setSaving] = React.useState(false);

  const valido = title.trim().length >= 1 && title.trim().length <= 60 && description.trim().length >= 1 && description.trim().length <= 400;
  const dirty = !isEdit || title !== item!.title || description !== item!.description;
  const canSave = valido && dirty && !saving;

  const guardar = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      if (isEdit) await actualizarAboutValueAction({ id: item!.id, title, description });
      else await crearAboutValueAction({ title, description });
      forgeToast({ tone: "success", title: isEdit ? "Valor actualizado" : "Valor creado", body: title.trim() });
      router.refresh();
      onDone();
    } catch (e) {
      forgeToast({ tone: "warning", title: "No se pudo guardar", body: e instanceof Error ? e.message : "Intenta de nuevo." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditorShell eyebrow={isEdit ? "EDITAR VALOR" : "NUEVO VALOR"} titulo={title.trim() || "Sin título"} onBack={onDone} onSave={guardar} saving={saving} canSave={canSave}>
      <label className="flex flex-col" style={{ gap: 8 }}>
        <Eyebrow style={{ paddingLeft: 2 }}>TÍTULO</Eyebrow>
        <Input placeholder="Ej. Comunidad" value={title} onChange={setTitle} autoFocus />
      </label>
      <label className="flex flex-col" style={{ gap: 8 }}>
        <Eyebrow style={{ paddingLeft: 2 }}>DESCRIPCIÓN</Eyebrow>
        <Textarea placeholder="Entrenamos juntos, no solos." value={description} onChange={setDescription} rows={4} />
      </label>
    </EditorShell>
  );
}

// ── INSTALACIONES ───────────────────────────────────────────────────────────
type InstalacionesView = { mode: "list" } | { mode: "edit"; item: FacilityDTO } | { mode: "new" };

function FacilitiesPane({ items }: { items: FacilityDTO[] }) {
  const router = useRouter();
  const [view, setView] = React.useState<InstalacionesView>({ mode: "list" });

  const mover = async (index: number, delta: -1 | 1) => {
    const next = swapped(items, index, delta);
    try {
      await reordenarFacilitiesAction({ ids: next.map((f) => f.id) });
      router.refresh();
    } catch {
      forgeToast({ tone: "warning", title: "No se pudo reordenar" });
    }
  };

  const borrar = async (f: FacilityDTO) => {
    if (!window.confirm(`¿Eliminar "${f.name}"?`)) return;
    try {
      await eliminarFacilityAction({ id: f.id });
      forgeToast({ tone: "success", title: "Instalación eliminada", body: f.name });
      router.refresh();
    } catch {
      forgeToast({ tone: "warning", title: "No se pudo eliminar" });
    }
  };

  if (view.mode !== "list") {
    return (
      <FacilityEditor item={view.mode === "edit" ? view.item : undefined} onDone={() => setView({ mode: "list" })} />
    );
  }

  return (
    <div className="flex flex-col" style={{ padding: "0 16px", gap: 8 }}>
      {items.length === 0 && <EmptyRow label="Sin instalaciones todavía" />}
      {items.map((f, i) => (
        <ContentRow
          key={f.id}
          title={f.name}
          sub={f.description}
          onEdit={() => setView({ mode: "edit", item: f })}
          onDelete={() => borrar(f)}
          reorder={<ReorderButtons onUp={() => mover(i, -1)} onDown={() => mover(i, 1)} canUp={i > 0} canDown={i < items.length - 1} />}
        />
      ))}
      <div style={{ marginTop: 10 }}>
        <Button variant="secondary" size="lg" full icon="plus" onClick={() => setView({ mode: "new" })}>
          AGREGAR INSTALACIÓN
        </Button>
      </div>
    </div>
  );
}

function FacilityEditor({ item, onDone }: { item?: FacilityDTO; onDone: () => void }) {
  const router = useRouter();
  const isEdit = !!item;
  const [name, setName] = React.useState(item?.name ?? "");
  const [description, setDescription] = React.useState(item?.description ?? "");
  const [saving, setSaving] = React.useState(false);

  const valido = name.trim().length >= 1 && name.trim().length <= 60 && description.trim().length >= 1 && description.trim().length <= 400;
  const dirty = !isEdit || name !== item!.name || description !== item!.description;
  const canSave = valido && dirty && !saving;

  const guardar = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      if (isEdit) await actualizarFacilityAction({ id: item!.id, name, description });
      else await crearFacilityAction({ name, description });
      forgeToast({ tone: "success", title: isEdit ? "Instalación actualizada" : "Instalación creada", body: name.trim() });
      router.refresh();
      onDone();
    } catch (e) {
      forgeToast({ tone: "warning", title: "No se pudo guardar", body: e instanceof Error ? e.message : "Intenta de nuevo." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditorShell eyebrow={isEdit ? "EDITAR INSTALACIÓN" : "NUEVA INSTALACIÓN"} titulo={name.trim() || "Sin nombre"} onBack={onDone} onSave={guardar} saving={saving} canSave={canSave}>
      <label className="flex flex-col" style={{ gap: 8 }}>
        <Eyebrow style={{ paddingLeft: 2 }}>NOMBRE</Eyebrow>
        <Input placeholder="Ej. Área de pesas" value={name} onChange={setName} autoFocus />
      </label>
      <label className="flex flex-col" style={{ gap: 8 }}>
        <Eyebrow style={{ paddingLeft: 2 }}>DESCRIPCIÓN</Eyebrow>
        <Textarea placeholder="Equipo completo de pesas libres." value={description} onChange={setDescription} rows={4} />
      </label>
    </EditorShell>
  );
}

// ── STATS ────────────────────────────────────────────────────────────────────
type StatsView = { mode: "list" } | { mode: "edit"; item: StatDTO } | { mode: "new" };

function StatsPane({ items }: { items: StatDTO[] }) {
  const router = useRouter();
  const [view, setView] = React.useState<StatsView>({ mode: "list" });

  const mover = async (index: number, delta: -1 | 1) => {
    const next = swapped(items, index, delta);
    try {
      await reordenarStatsAction({ ids: next.map((s) => s.id) });
      router.refresh();
    } catch {
      forgeToast({ tone: "warning", title: "No se pudo reordenar" });
    }
  };

  const borrar = async (s: StatDTO) => {
    if (!window.confirm(`¿Eliminar "${s.label}"?`)) return;
    try {
      await eliminarStatAction({ id: s.id });
      forgeToast({ tone: "success", title: "Stat eliminado", body: s.label });
      router.refresh();
    } catch {
      forgeToast({ tone: "warning", title: "No se pudo eliminar" });
    }
  };

  if (view.mode !== "list") {
    return <StatEditor item={view.mode === "edit" ? view.item : undefined} onDone={() => setView({ mode: "list" })} />;
  }

  return (
    <div className="flex flex-col" style={{ padding: "0 16px", gap: 8 }}>
      {items.length === 0 && <EmptyRow label="Sin stats todavía" />}
      {items.map((s, i) => (
        <ContentRow
          key={s.id}
          title={s.label}
          sub={s.value}
          onEdit={() => setView({ mode: "edit", item: s })}
          onDelete={() => borrar(s)}
          reorder={<ReorderButtons onUp={() => mover(i, -1)} onDown={() => mover(i, 1)} canUp={i > 0} canDown={i < items.length - 1} />}
        />
      ))}
      <div style={{ marginTop: 10 }}>
        <Button variant="secondary" size="lg" full icon="plus" onClick={() => setView({ mode: "new" })}>
          AGREGAR STAT
        </Button>
      </div>
    </div>
  );
}

function StatEditor({ item, onDone }: { item?: StatDTO; onDone: () => void }) {
  const router = useRouter();
  const isEdit = !!item;
  const [label, setLabel] = React.useState(item?.label ?? "");
  const [value, setValue] = React.useState(item?.value ?? "");
  const [saving, setSaving] = React.useState(false);

  const valido = label.trim().length >= 1 && label.trim().length <= 60 && value.trim().length >= 1 && value.trim().length <= 30;
  const dirty = !isEdit || label !== item!.label || value !== item!.value;
  const canSave = valido && dirty && !saving;

  const guardar = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      if (isEdit) await actualizarStatAction({ id: item!.id, label, value });
      else await crearStatAction({ label, value });
      forgeToast({ tone: "success", title: isEdit ? "Stat actualizado" : "Stat creado", body: label.trim() });
      router.refresh();
      onDone();
    } catch (e) {
      forgeToast({ tone: "warning", title: "No se pudo guardar", body: e instanceof Error ? e.message : "Intenta de nuevo." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditorShell eyebrow={isEdit ? "EDITAR STAT" : "NUEVO STAT"} titulo={label.trim() || "Sin etiqueta"} onBack={onDone} onSave={guardar} saving={saving} canSave={canSave}>
      <label className="flex flex-col" style={{ gap: 8 }}>
        <Eyebrow style={{ paddingLeft: 2 }}>ETIQUETA</Eyebrow>
        <Input placeholder="Ej. Miembros activos" value={label} onChange={setLabel} autoFocus />
      </label>
      <label className="flex flex-col" style={{ gap: 8 }}>
        <Eyebrow style={{ paddingLeft: 2 }}>VALOR</Eyebrow>
        <Input placeholder="Ej. 500+" value={value} onChange={setValue} />
      </label>
    </EditorShell>
  );
}

// ── FAQ ──────────────────────────────────────────────────────────────────────
type FaqView = { mode: "list" } | { mode: "edit"; item: FaqDTO } | { mode: "new" };

function FaqsPane({ items }: { items: FaqDTO[] }) {
  const router = useRouter();
  const [view, setView] = React.useState<FaqView>({ mode: "list" });

  const mover = async (index: number, delta: -1 | 1) => {
    const next = swapped(items, index, delta);
    try {
      await reordenarFaqsAction({ ids: next.map((f) => f.id) });
      router.refresh();
    } catch {
      forgeToast({ tone: "warning", title: "No se pudo reordenar" });
    }
  };

  const borrar = async (f: FaqDTO) => {
    if (!window.confirm(`¿Eliminar "${f.question}"?`)) return;
    try {
      await eliminarFaqAction({ id: f.id });
      forgeToast({ tone: "success", title: "Pregunta eliminada", body: f.question });
      router.refresh();
    } catch {
      forgeToast({ tone: "warning", title: "No se pudo eliminar" });
    }
  };

  if (view.mode !== "list") {
    return <FaqEditor item={view.mode === "edit" ? view.item : undefined} onDone={() => setView({ mode: "list" })} />;
  }

  return (
    <div className="flex flex-col" style={{ padding: "0 16px", gap: 8 }}>
      {items.length === 0 && <EmptyRow label="Sin preguntas todavía" />}
      {items.map((f, i) => (
        <ContentRow
          key={f.id}
          title={f.question}
          sub={f.answer}
          onEdit={() => setView({ mode: "edit", item: f })}
          onDelete={() => borrar(f)}
          reorder={<ReorderButtons onUp={() => mover(i, -1)} onDown={() => mover(i, 1)} canUp={i > 0} canDown={i < items.length - 1} />}
        />
      ))}
      <div style={{ marginTop: 10 }}>
        <Button variant="secondary" size="lg" full icon="plus" onClick={() => setView({ mode: "new" })}>
          AGREGAR PREGUNTA
        </Button>
      </div>
    </div>
  );
}

function FaqEditor({ item, onDone }: { item?: FaqDTO; onDone: () => void }) {
  const router = useRouter();
  const isEdit = !!item;
  const [question, setQuestion] = React.useState(item?.question ?? "");
  const [answer, setAnswer] = React.useState(item?.answer ?? "");
  const [saving, setSaving] = React.useState(false);

  const valido = question.trim().length >= 1 && question.trim().length <= 200 && answer.trim().length >= 1 && answer.trim().length <= 1000;
  const dirty = !isEdit || question !== item!.question || answer !== item!.answer;
  const canSave = valido && dirty && !saving;

  const guardar = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      if (isEdit) await actualizarFaqAction({ id: item!.id, question, answer });
      else await crearFaqAction({ question, answer });
      forgeToast({ tone: "success", title: isEdit ? "Pregunta actualizada" : "Pregunta creada", body: question.trim() });
      router.refresh();
      onDone();
    } catch (e) {
      forgeToast({ tone: "warning", title: "No se pudo guardar", body: e instanceof Error ? e.message : "Intenta de nuevo." });
    } finally {
      setSaving(false);
    }
  };

  return (
    <EditorShell eyebrow={isEdit ? "EDITAR PREGUNTA" : "NUEVA PREGUNTA"} titulo={question.trim() || "Sin pregunta"} onBack={onDone} onSave={guardar} saving={saving} canSave={canSave}>
      <label className="flex flex-col" style={{ gap: 8 }}>
        <Eyebrow style={{ paddingLeft: 2 }}>PREGUNTA</Eyebrow>
        <Input placeholder="¿Necesito membresía anual?" value={question} onChange={setQuestion} autoFocus />
      </label>
      <label className="flex flex-col" style={{ gap: 8 }}>
        <Eyebrow style={{ paddingLeft: 2 }}>RESPUESTA</Eyebrow>
        <Textarea placeholder="No, manejamos paquetes por clases." value={answer} onChange={setAnswer} rows={4} />
      </label>
    </EditorShell>
  );
}

// ── Shared row/editor chrome (layout only — no data logic) ─────────────────
function ContentRow({
  title,
  sub,
  onEdit,
  onDelete,
  reorder,
}: {
  title: string;
  sub: string;
  onEdit: () => void;
  onDelete: () => void;
  reorder: React.ReactNode;
}) {
  return (
    <div className="flex items-center" style={{ gap: 10, border: "1px solid var(--line)", background: "var(--surface)", padding: "10px 8px 10px 10px" }}>
      {reorder}
      <button
        onClick={onEdit}
        className="flex min-w-0 flex-1 items-center"
        style={{ gap: 12, textAlign: "left", background: "transparent", border: "none", cursor: "pointer" }}
      >
        <div className="min-w-0 flex-1">
          <div className="font-bold" style={{ fontSize: 12.5, letterSpacing: 0.4, color: "var(--fg)" }}>{title}</div>
          <div
            style={{ marginTop: 4, fontSize: 11.5, color: "var(--muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}
          >
            {sub}
          </div>
        </div>
        <Icon name="chev" size={13} color="var(--muted-soft)" />
      </button>
      <button
        onClick={onDelete}
        aria-label="Eliminar"
        className="forge-hit forge-pressable flex shrink-0 items-center justify-center"
        style={{ width: 30, height: 30, background: "transparent", border: "none", cursor: "pointer" }}
      >
        <Icon name="trash" size={14} color="var(--muted)" />
      </button>
    </div>
  );
}

function EmptyRow({ label }: { label: string }) {
  return (
    <div
      className="flex flex-col items-center"
      style={{ gap: 8, border: "1px dashed var(--line)", background: "var(--surface)", padding: "22px 16px", textAlign: "center" }}
    >
      <div style={{ fontSize: 12.5, color: "var(--muted)" }}>{label}</div>
    </div>
  );
}

function EditorShell({
  eyebrow,
  titulo,
  onBack,
  onSave,
  saving,
  canSave,
  children,
}: {
  eyebrow: string;
  titulo: string;
  onBack: () => void;
  onSave: () => void;
  saving: boolean;
  canSave: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center" style={{ gap: 10, padding: "8px 16px 14px" }}>
        <button
          onClick={onBack}
          aria-label="Atrás"
          className="forge-hit forge-pressable flex items-center justify-center border border-line bg-surface"
          style={{ width: 34, height: 34, padding: 0, cursor: "pointer" }}
        >
          <Icon name="back" size={14} color="var(--muted)" />
        </button>
        <div className="min-w-0 flex-1">
          <Eyebrow color="var(--gold)">{eyebrow}</Eyebrow>
          <H1 size={20} style={{ marginTop: 4 }}>
            {titulo}
          </H1>
        </div>
      </div>

      <div className="flex flex-col" style={{ padding: "0 16px", gap: 18 }}>
        {children}
      </div>

      <div style={{ borderTop: "1px solid var(--line)", margin: "20px 0 0", padding: "20px 16px 4px" }}>
        <Button variant="primary" size="lg" full icon="check" disabled={!canSave} onClick={onSave}>
          {saving ? "GUARDANDO…" : "GUARDAR"}
        </Button>
      </div>
    </div>
  );
}
