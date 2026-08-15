"use client";

import { Icon } from "@gym/ui/forge/icon";
import { Tnum } from "@gym/ui/forge/ui";
import type { PaqueteDTO } from "@gym/data/server/paquetes";
import { pesos } from "@gym/format";
import { PERSONALIZADO, type CustomForm } from "../vender/_components/vender-vm";
import { PersonalizadoEditor } from "./personalizado-editor";

/**
 * The paquete tile list — every registered plan plus the PERSONALIZADO tile. LIFTED out of
 * vender's `PaqueteEditor` (paquete-swap spec §5.1) so the payment-correction sheet's package
 * swap picker renders byte-identical tiles from one definition. Pure presentation: `sel`/
 * `setSel` own selection, `custom`/`setCustom` own the personalizado form. vender's own
 * `PaqueteEditor` wraps this with its backdate affordance row; the correction sheet renders
 * it bare with `vigenciaEnd={null}`.
 */
export function PaqueteTiles({
  paquetes,
  sel,
  setSel,
  vigenciaEnd,
  custom,
  setCustom,
  customHasta,
  mostrarPrecio = true,
}: {
  paquetes: PaqueteDTO[];
  sel: string | null;
  setSel: (id: string) => void;
  /** The SELECTED tile's "Hasta …" hint (vender: the fresh-sale expiry, if bought today).
   *  Null renders every tile's plain vigencia label instead — the correction sheet's picker
   *  has no single "if bought today" anchor, so it always passes null. */
  vigenciaEnd: string | null;
  custom: CustomForm;
  setCustom: (f: CustomForm) => void;
  customHasta: string | null;
  /** Forwarded to `PersonalizadoEditor` — false hides its own PRECIO field (the correction
   *  sheet's MONTO field above is already the price). */
  mostrarPrecio?: boolean;
}) {
  const onCustom = sel === PERSONALIZADO;
  return (
    <div className="flex flex-col" style={{ gap: 8 }}>
      {paquetes.map((p) => {
        const on = sel === p.id;
        return (
          <button
            key={p.id}
            onClick={() => setSel(p.id)}
            className="forge-pressable flex items-center justify-between text-left"
            style={{ padding: 18, background: "transparent", border: `1px solid ${on ? "var(--yellow)" : "var(--line)"}`, color: "var(--fg)", cursor: "pointer", transition: "border-color 140ms ease" }}
          >
            <div className="flex flex-col" style={{ gap: 4 }}>
              <div className="uppercase font-bold" style={{ fontSize: 16, letterSpacing: -0.1 }}>{p.nombre}</div>
              <div className="uppercase" style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 0.8 }}>{on && vigenciaEnd ? `Hasta ${vigenciaEnd}` : p.vigencia}</div>
            </div>
            <Tnum className="font-extrabold" style={{ fontSize: 22, color: on ? "var(--yellow)" : "var(--fg)", letterSpacing: -0.4 }}>{pesos(p.precio)}</Tnum>
          </button>
        );
      })}

      {/* Promos, discounts and one-off deals. Never becomes a paquetes row, so it can
          never reach the gym's public catalog (spec §2). */}
      <div style={{ border: `1px solid ${onCustom ? "var(--yellow)" : "var(--line)"}`, transition: "border-color 140ms ease" }}>
        <button
          onClick={() => setSel(PERSONALIZADO)}
          className="forge-pressable flex items-center justify-between text-left"
          style={{ width: "100%", padding: 18, background: "transparent", border: "none", color: "var(--fg)", cursor: "pointer" }}
        >
          <div className="flex flex-col" style={{ gap: 4 }}>
            <div className="uppercase font-bold" style={{ fontSize: 16, letterSpacing: -0.1 }}>Personalizado</div>
            <div className="uppercase" style={{ fontSize: 11, color: "var(--muted)", letterSpacing: 0.8 }}>Promo · descuento · plan especial</div>
          </div>
          <Icon name="plus" size={20} color={onCustom ? "var(--gold)" : "var(--muted)"} />
        </button>
        {onCustom && (
          <div style={{ padding: "0 18px 18px" }}>
            <PersonalizadoEditor form={custom} setForm={setCustom} hasta={customHasta} mostrarPrecio={mostrarPrecio} />
          </div>
        )}
      </div>
    </div>
  );
}
