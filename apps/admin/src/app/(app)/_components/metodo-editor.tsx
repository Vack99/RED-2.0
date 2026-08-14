"use client";

import { Icon, type IconName } from "@gym/ui/forge/icon";
import type { Metodo } from "@gym/data/server/ventas";

/** The three payment methods, in desk order, with the display casing they carry on every
 *  screen. Lifted out of vender.tsx when the correction sheet (#269) became the SECOND
 *  surface that picks a método — the tiles and the label casing live here once, and the
 *  value IS the stored `ventas.metodo` (no display↔enum map to keep in step). */
const OPTS: { k: Metodo; label: string; icon: IconName }[] = [
  { k: "efectivo", label: "Efectivo", icon: "cash" },
  { k: "tarjeta", label: "Tarjeta", icon: "card" },
  { k: "transferencia", label: "Transferencia", icon: "swap" },
];

export function MetodoEditor({
  metodo,
  setMetodo,
}: {
  metodo: Metodo | null;
  setMetodo: (m: Metodo) => void;
}) {
  return (
    <div className="grid grid-cols-3" style={{ gap: 8 }}>
      {OPTS.map((o) => {
        const on = metodo === o.k;
        return (
          <button
            key={o.k}
            onClick={() => setMetodo(o.k)}
            className="forge-pressable flex flex-col items-center"
            style={{ padding: "18px 6px", background: "transparent", border: `1px solid ${on ? "var(--yellow)" : "var(--line)"}`, color: on ? "var(--yellow)" : "var(--fg)", cursor: "pointer", gap: 8, transition: "border-color 140ms ease" }}
          >
            <Icon name={o.icon} size={20} color={on ? "var(--gold)" : "var(--muted)"} />
            <span className="uppercase font-bold" style={{ fontSize: 10.5, letterSpacing: 1.2 }}>{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
