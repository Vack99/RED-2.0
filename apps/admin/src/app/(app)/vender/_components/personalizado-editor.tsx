"use client";

import * as React from "react";
import { Eyebrow, Input } from "@gym/ui/forge/ui";

import { customErrors, LIMITES, type CustomErrors, type CustomForm } from "./vender-vm";

/**
 * The PERSONALIZADO form — a promo, discount or one-off package typed at the desk.
 * It never becomes a paquetes row, so it can never reach the gym's public catalog
 * (spec §2). It DOES reach the member: `mi_membresia` anchors their plan card on the
 * latest venta, so whatever is typed here is what they see. Hence the hint below.
 *
 * Pure presentation: every rule lives in vender-vm (customErrors / LIMITES).
 */
export function PersonalizadoEditor({
  form,
  setForm,
  hasta,
}: {
  form: CustomForm;
  setForm: (f: CustomForm) => void;
  /** Expiry if sold today, e.g. "25 ago" — derived by the parent in the GYM's timezone. */
  hasta: string | null;
}) {
  const [blurred, setBlurred] = React.useState<Partial<Record<keyof CustomErrors, boolean>>>({});
  const errors = customErrors(form, blurred);
  const touch = (k: keyof CustomErrors) => setBlurred((b) => ({ ...b, [k]: true }));
  const set = <K extends keyof CustomForm>(k: K, v: CustomForm[K]) => setForm({ ...form, [k]: v });

  return (
    <div className="flex flex-col" style={{ gap: 16, padding: "16px 2px 4px" }}>
      <Campo label="NOMBRE" error={errors.nombre}>
        <Input
          placeholder="Promo Verano 2x1"
          value={form.nombre}
          onChange={(v: string) => set("nombre", v)}
          onBlur={() => touch("nombre")}
          maxLength={LIMITES.nombreMax}
        />
        <Nota>Este nombre aparece en el ticket y en la cuenta del cliente.</Nota>
      </Campo>

      <div className="grid grid-cols-2" style={{ gap: 12 }}>
        <Campo label="PRECIO" error={errors.precio}>
          <Input
            inputMode="numeric"
            placeholder="750"
            value={form.precio}
            onChange={(v: string) => set("precio", v)}
            onBlur={() => touch("precio")}
          />
        </Campo>

        <Campo label="VIGENCIA" error={errors.dias}>
          <Input
            inputMode="numeric"
            placeholder="45"
            value={form.dias}
            onChange={(v: string) => set("dias", v)}
            onBlur={() => touch("dias")}
          />
          <Nota>{hasta ? `Hasta ${hasta}` : "Días desde hoy"}</Nota>
        </Campo>
      </div>

      <Campo label="CLASES" error={errors.clases}>
        <div className="flex" style={{ gap: 8 }}>
          <div style={{ flex: 1, opacity: form.ilimitado ? 0.4 : 1 }}>
            <Input
              inputMode="numeric"
              placeholder="12"
              value={form.ilimitado ? "" : form.clases}
              onChange={(v: string) => set("clases", v)}
              onBlur={() => touch("clases")}
              disabled={form.ilimitado}
            />
          </div>
          <button
            type="button"
            onClick={() => set("ilimitado", !form.ilimitado)}
            aria-pressed={form.ilimitado}
            className="forge-pressable uppercase font-bold"
            style={{
              padding: "0 18px",
              background: "transparent",
              border: `1px solid ${form.ilimitado ? "var(--yellow)" : "var(--line)"}`,
              color: form.ilimitado ? "var(--yellow)" : "var(--muted)",
              cursor: "pointer",
              fontSize: 10.5,
              letterSpacing: 1.2,
              transition: "border-color 140ms ease, color 140ms ease",
            }}
          >
            Ilimitado
          </button>
        </div>
      </Campo>
    </div>
  );
}

function Campo({
  label,
  error,
  children,
}: {
  label: string;
  error: string | null;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-col" style={{ gap: 7 }}>
      <Eyebrow>{label}</Eyebrow>
      {children}
      {error && (
        <div style={{ fontSize: 11, color: "var(--red)", letterSpacing: 0.2 }}>{error}</div>
      )}
    </div>
  );
}

function Nota({ children }: { children: React.ReactNode }) {
  return <div style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 0.2 }}>{children}</div>;
}
