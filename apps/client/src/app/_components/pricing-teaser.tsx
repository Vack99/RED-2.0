"use client";

import { useState } from "react";
import Link from "next/link";

import { pesos } from "@gym/format";
import type { PlanPublicoDTO } from "@gym/data/server/marketing";

/**
 * The landing's collapsible pricing teaser (the mock's `cm-prices`). "Ver precios" toggles the panel
 * open; inside, the real catalog — the SAME `getPlanesPublicos` rows the Precios page renders, so there
 * is one source of price truth, never a second hardcoded list. Each plan links through to Precios for the
 * full card; "Ver todos los planes" is the catch-all. A client island purely for the open/close state —
 * the plans arrive pre-read as props (no fetching here).
 */
export function PricingTeaser({ planes }: { planes: PlanPublicoDTO[] }) {
  const [open, setOpen] = useState(false);

  if (planes.length === 0) return null;

  return (
    <section className="mx-auto mt-5 w-full max-w-md px-7">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-center gap-2 py-2 text-sm font-semibold text-muted hover:text-fg"
      >
        <span>Ver precios</span>
        <span
          aria-hidden
          className={`text-xs leading-none motion-safe:transition-transform ${open ? "rotate-180" : ""}`}
        >
          ▾
        </span>
      </button>

      {open && (
        <div className="pt-2">
          {planes.map((plan) => (
            <Link
              key={plan.id}
              href="/precios"
              className="flex items-baseline justify-between border-t border-line py-4 last:border-b"
            >
              <span>
                <span
                  className={`block text-sm ${plan.popular ? "font-bold text-accent" : "text-fg"}`}
                >
                  {plan.name}
                </span>
                {plan.subtitle && (
                  <span className="mt-0.5 block text-[11px] text-muted">{plan.subtitle}</span>
                )}
              </span>
              <span className="text-xl font-extrabold tabular-nums text-fg">{pesos(plan.precio)}</span>
            </Link>
          ))}
          <Link
            href="/precios"
            className="mt-3 block py-1.5 text-center text-[11px] font-semibold uppercase tracking-[0.14em] text-accent"
          >
            Ver todos los planes →
          </Link>
        </div>
      )}
    </section>
  );
}
