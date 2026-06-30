"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ClasesPicker } from "@/components/forge/clases-picker";
import { Icon } from "@/components/forge/icon";
import { forgeToast } from "@/components/forge/toaster";
import { Button, Eyebrow, H1, Input } from "@/components/forge/ui";
import { nombrePaquete } from "@gym/domain/rules";
import type { PaqueteDTO } from "@gym/data/server/paquetes";
import { pesos } from "@gym/format";
import { actualizarPaqueteAction } from "../actions";

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

export function PaqueteEditor({
  paquete,
  onDone,
}: {
  paquete: Pick<PaqueteDTO, "id" | "precio" | "popular" | "clases">;
  onDone: () => void;
}) {
  const router = useRouter();
  // The real class grant (1..30 or null = ilimitado). The display nombre is
  // DERIVED from this — there is no free-text name field anymore.
  const [clases, setClases] = React.useState<number | null>(paquete.clases);
  // Price is held as a string (controlled text) and parsed on validate/save —
  // the column is int, so we never carry decimals through the form.
  const [precioStr, setPrecioStr] = React.useState(String(paquete.precio));
  const [popular, setPopular] = React.useState(paquete.popular);
  const [saving, setSaving] = React.useState(false);

  const precio = parsePrecio(precioStr);
  // clases is always valid (it comes from the picker: 1..30 or null), so only
  // the price needs gating.
  const valido = Number.isInteger(precio) && precio > 0;
  const dirty =
    clases !== paquete.clases || precio !== paquete.precio || popular !== paquete.popular;
  const canSave = valido && dirty && !saving;

  const derivedLabel = nombrePaquete(clases);

  const guardar = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await actualizarPaqueteAction({ id: paquete.id, precio, popular, clases });
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
      </div>

      <div style={{ borderTop: "1px solid var(--line)", margin: "24px 0 0", padding: "20px 16px 4px" }}>
        <Button variant="primary" size="lg" full icon="check" disabled={!canSave} onClick={guardar}>
          {saving ? "GUARDANDO…" : "GUARDAR"}
        </Button>
      </div>
    </div>
  );
}
