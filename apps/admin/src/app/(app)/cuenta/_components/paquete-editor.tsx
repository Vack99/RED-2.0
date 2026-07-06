"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ClasesPicker } from "@gym/ui/forge/clases-picker";
import { Icon, type IconName } from "@gym/ui/forge/icon";
import { forgeToast } from "@gym/ui/forge/toaster";
import { Button, Eyebrow, H1, Input } from "@gym/ui/forge/ui";
import { nombrePaquete } from "@gym/domain/rules";
import type { PlanEditorDTO } from "@gym/data/server/paquetes";
import { pesos } from "@gym/format";
import {
  actualizarPaqueteAction,
  actualizarPaqueteMarketingAction,
  setPlanFeaturesAction,
} from "../actions";

/** Parse the price field to a whole-peso integer (es-MX, no centavos in v1).
 *  Strips spaces, "$" and thousands separators, so "$1,200" or "1200 " read as
 *  1200. A decimal point means the operator typed centavos: we reject it (NaN ->
 *  fails the `valido` gate) rather than silently folding the centavos into the
 *  integer — "1200.50" must NOT become 120050. An empty/non-numeric field also
 *  reads as NaN. Mirrors the Zod boundary (`z.number().int().positive()`). */
function parsePrecio(raw: string): number {
  const cleaned = raw.replace(/[\s$,]/g, "");
  if (cleaned.includes(".")) return NaN; // centavos / decimal — whole pesos only in v1
  const digits = cleaned.replace(/\D/g, "");
  return digits.length === 0 ? NaN : Number(digits);
}

const MAX_FEATURES = 12;
const cleanList = (fs: string[]): string[] => fs.map((f) => f.trim()).filter((f) => f.length > 0);
const sameList = (a: string[], b: string[]): boolean =>
  a.length === b.length && a.every((x, i) => x === b[i]);

/** Compact square icon button reused by the feature-list row (up / down / remove). */
function SquareBtn({
  icon,
  label,
  onClick,
  disabled,
  rotate,
}: {
  icon: IconName;
  label: string;
  onClick: () => void;
  disabled?: boolean;
  rotate?: number;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className="forge-hit forge-pressable flex shrink-0 items-center justify-center border border-line bg-surface"
      style={{ width: 38, height: 38, padding: 0, cursor: disabled ? "default" : "pointer", opacity: disabled ? 0.35 : 1 }}
    >
      <span
        className="flex items-center justify-center"
        style={rotate ? { transform: `rotate(${rotate}deg)` } : undefined}
      >
        <Icon name={icon} size={13} color="var(--muted)" />
      </span>
    </button>
  );
}

export function PaqueteEditor({
  paquete,
  onDone,
}: {
  paquete: PlanEditorDTO;
  onDone: () => void;
}) {
  const router = useRouter();
  // The real class grant (1..30 or null = ilimitado). The display nombre is
  // DERIVED from this — there is no free-text name field for the grant label.
  const [clases, setClases] = React.useState<number | null>(paquete.clases);
  // Price is held as a string (controlled text) and parsed on validate/save —
  // the column is int, so we never carry decimals through the form.
  const [precioStr, setPrecioStr] = React.useState(String(paquete.precio));
  const [popular, setPopular] = React.useState(paquete.popular);
  // Marketing-only copy (distinct from the derived nombre; ADR-0007).
  const [code, setCode] = React.useState(paquete.code ?? "");
  const [name, setName] = React.useState(paquete.name ?? "");
  const [subtitle, setSubtitle] = React.useState(paquete.subtitle ?? "");
  const [badge, setBadge] = React.useState(paquete.badge ?? "");
  const [cadence, setCadence] = React.useState(paquete.cadence ?? "");
  // Ordered feature list (array position = display order).
  const [features, setFeatures] = React.useState<string[]>(paquete.features);
  const [saving, setSaving] = React.useState(false);

  const precio = parsePrecio(precioStr);
  // clases is always valid (it comes from the picker: 1..30 or null), so only
  // the price needs gating.
  const valido = Number.isInteger(precio) && precio > 0;
  const derivedLabel = nombrePaquete(clases);
  const cleanFeatures = cleanList(features);

  const moneyDirty =
    clases !== paquete.clases || precio !== paquete.precio || popular !== paquete.popular;
  const marketingDirty =
    code.trim() !== (paquete.code ?? "") ||
    name.trim() !== (paquete.name ?? "") ||
    subtitle.trim() !== (paquete.subtitle ?? "") ||
    badge.trim() !== (paquete.badge ?? "") ||
    cadence.trim() !== (paquete.cadence ?? "");
  const featuresDirty = !sameList(cleanFeatures, paquete.features);
  const canSave = valido && (moneyDirty || marketingDirty || featuresDirty) && !saving;

  const updateFeature = (i: number, v: string) =>
    setFeatures((fs) => fs.map((f, j) => (j === i ? v : f)));
  const removeFeature = (i: number) => setFeatures((fs) => fs.filter((_, j) => j !== i));
  const addFeature = () => setFeatures((fs) => (fs.length >= MAX_FEATURES ? fs : [...fs, ""]));
  const moveFeature = (i: number, dir: -1 | 1) =>
    setFeatures((fs) => {
      const j = i + dir;
      if (j < 0 || j >= fs.length) return fs;
      const next = [...fs];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });

  const guardar = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      if (moneyDirty) await actualizarPaqueteAction({ id: paquete.id, precio, popular, clases });
      if (marketingDirty)
        await actualizarPaqueteMarketingAction({
          id: paquete.id,
          code: code.trim(),
          name: name.trim(),
          subtitle: subtitle.trim(),
          badge: badge.trim(),
          cadence: cadence.trim(),
        });
      if (featuresDirty)
        await setPlanFeaturesAction({ planId: paquete.id, features: cleanFeatures });
      forgeToast({ tone: "success", title: "Paquete actualizado", body: derivedLabel });
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
          onClick={onDone}
          aria-label="Atrás"
          className="forge-hit forge-pressable flex items-center justify-center border border-line bg-surface"
          style={{ width: 34, height: 34, padding: 0, cursor: "pointer" }}
        >
          <Icon name="back" size={14} color="var(--muted)" />
        </button>
        <div className="min-w-0 flex-1">
          <Eyebrow color="var(--gold)">EDITAR PAQUETE</Eyebrow>
          <H1 size={20} style={{ marginTop: 4 }}>
            {derivedLabel}
          </H1>
        </div>
      </div>

      <div className="flex flex-col" style={{ padding: "0 16px", gap: 18 }}>
        <div className="flex flex-col" style={{ gap: 8 }}>
          <Eyebrow style={{ paddingLeft: 2 }}>CLASES</Eyebrow>
          <ClasesPicker value={clases} onChange={setClases} />
          <span style={{ paddingLeft: 2, fontSize: 11, color: "var(--muted)" }}>
            Se mostrará como “{derivedLabel}”.
          </span>
        </div>

        <label className="flex flex-col" style={{ gap: 8 }}>
          <Eyebrow style={{ paddingLeft: 2 }}>PRECIO</Eyebrow>
          <Input
            icon="cash"
            placeholder="800"
            value={precioStr}
            onChange={setPrecioStr}
            suffix="MXN"
            inputMode="numeric"
          />
          <span className="tnum" style={{ paddingLeft: 2, fontSize: 11, color: "var(--muted)" }}>
            {valido ? pesos(precio) : "Pesos enteros, sin centavos"}
          </span>
        </label>

        <div className="flex flex-col" style={{ gap: 8 }}>
          <Eyebrow style={{ paddingLeft: 2 }}>DESTACADO</Eyebrow>
          <button
            onClick={() => setPopular((v) => !v)}
            aria-pressed={popular}
            className="forge-pressable flex w-full items-center border border-line bg-surface text-left"
            style={{
              gap: 12,
              padding: "14px 16px",
              cursor: "pointer",
              borderColor: popular ? "var(--yellow)" : "var(--line)",
            }}
          >
            <div
              className="flex shrink-0 items-center justify-center border border-line"
              style={{ width: 32, height: 32, background: "var(--canvas)" }}
            >
              <Icon name="star" size={15} color={popular ? "var(--gold)" : "var(--muted-soft)"} />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold" style={{ fontSize: 12.5, letterSpacing: 0.6, color: "var(--fg)" }}>
                PAQUETE POPULAR
              </div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
                {popular ? "Lleva la estrella dorada" : "Toca para destacar este paquete"}
              </div>
            </div>
            <span
              className="flex shrink-0 items-center justify-center"
              style={{
                width: 20,
                height: 20,
                border: `1.5px solid ${popular ? "var(--yellow)" : "var(--line)"}`,
                background: popular ? "var(--yellow)" : "transparent",
              }}
            >
              {popular && <Icon name="check" size={12} color="var(--ink)" />}
            </span>
          </button>
          <span style={{ paddingLeft: 2, fontSize: 11, color: "var(--muted)" }}>
            Como máximo un paquete puede ser el favorito.
          </span>
        </div>

        {/* ── Marketing (display-only; distinct from the derived label above) ── */}
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 16 }}>
          <Eyebrow color="var(--gold)" style={{ paddingLeft: 2 }}>
            PRESENTACIÓN EN LA APP
          </Eyebrow>
          <span style={{ display: "block", paddingLeft: 2, marginTop: 4, fontSize: 11, color: "var(--muted)" }}>
            Textos de marketing para la página de precios. No cambian el precio ni las clases.
          </span>
        </div>

        <label className="flex flex-col" style={{ gap: 8 }}>
          <Eyebrow style={{ paddingLeft: 2 }}>NOMBRE COMERCIAL</Eyebrow>
          <Input placeholder="Plan Pro" value={name} onChange={setName} />
        </label>

        <label className="flex flex-col" style={{ gap: 8 }}>
          <Eyebrow style={{ paddingLeft: 2 }}>SUBTÍTULO</Eyebrow>
          <Input placeholder="Ideal para entrenar en serio" value={subtitle} onChange={setSubtitle} />
        </label>

        <div className="flex" style={{ gap: 10 }}>
          <label className="flex flex-1 flex-col" style={{ gap: 8 }}>
            <Eyebrow style={{ paddingLeft: 2 }}>INSIGNIA</Eyebrow>
            <Input placeholder="MÁS VENDIDO" value={badge} onChange={setBadge} />
          </label>
          <label className="flex flex-1 flex-col" style={{ gap: 8 }}>
            <Eyebrow style={{ paddingLeft: 2 }}>CADENCIA</Eyebrow>
            <Input placeholder="por mes" value={cadence} onChange={setCadence} />
          </label>
        </div>

        <label className="flex flex-col" style={{ gap: 8 }}>
          <Eyebrow style={{ paddingLeft: 2 }}>CÓDIGO</Eyebrow>
          <Input placeholder="PRO" value={code} onChange={setCode} />
          <span style={{ paddingLeft: 2, fontSize: 11, color: "var(--muted)" }}>
            Identificador corto y único por gimnasio (opcional).
          </span>
        </label>

        <div className="flex flex-col" style={{ gap: 8 }}>
          <Eyebrow style={{ paddingLeft: 2 }}>CARACTERÍSTICAS</Eyebrow>
          {features.map((f, i) => (
            <div key={i} className="flex items-center" style={{ gap: 6 }}>
              <Input
                placeholder="Acceso a todas las clases"
                value={f}
                onChange={(v) => updateFeature(i, v)}
                style={{ flex: 1 }}
              />
              <SquareBtn icon="chev" rotate={-90} label="Subir" onClick={() => moveFeature(i, -1)} disabled={i === 0} />
              <SquareBtn icon="chev" rotate={90} label="Bajar" onClick={() => moveFeature(i, 1)} disabled={i === features.length - 1} />
              <SquareBtn icon="trash" label="Quitar" onClick={() => removeFeature(i)} />
            </div>
          ))}
          <button
            type="button"
            onClick={addFeature}
            disabled={features.length >= MAX_FEATURES}
            className="forge-pressable flex items-center justify-center border border-line bg-surface uppercase font-bold"
            style={{
              gap: 7,
              padding: "12px 16px",
              fontSize: 11.5,
              letterSpacing: 0.8,
              color: "var(--fg)",
              cursor: features.length >= MAX_FEATURES ? "default" : "pointer",
              opacity: features.length >= MAX_FEATURES ? 0.4 : 1,
            }}
          >
            <Icon name="plus" size={13} color="var(--gold)" />
            AGREGAR CARACTERÍSTICA
          </button>
          <span style={{ paddingLeft: 2, fontSize: 11, color: "var(--muted)" }}>
            Aparecen en la app en este orden.
          </span>
        </div>
      </div>

      <div style={{ borderTop: "1px solid var(--line)", margin: "24px 0 0", padding: "20px 16px 4px" }}>
        <Button variant="primary" size="lg" full icon="check" disabled={!canSave} onClick={guardar}>
          {saving ? "GUARDANDO…" : "GUARDAR"}
        </Button>
      </div>
    </div>
  );
}
