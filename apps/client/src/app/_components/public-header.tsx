"use client";

import { useState, type ComponentProps } from "react";
import type { Route } from "next";
import Link from "next/link";

import { brands, type BrandId } from "@gym/brand";

/** The typed-Route href next/link accepts (the `typedRoutes` union). Typing the table with this — not a
 *  bare `string` — keeps each literal below validated against the real route map at build (the same seam
 *  @gym/ui's TabBar uses to stay brand-neutral), instead of widening to an unchecked string. */
type Href = ComponentProps<typeof Link>["href"];

/** The public nav destinations, in drawer order (mock `cm-dnav`). The drawer is the nav hub for the
 *  sibling marketing pages: Nosotros (#52) and Contacto (#53) land alongside this landing off the same
 *  base, so they are typed `as Route` — Next's sanctioned marker for an intentional cross-slice route
 *  that resolves on assembly (the guard stays live for every co-present route). "Clases" is the booking
 *  funnel: a logged-out prospect must register before reserving, so it (and every "Reservar" CTA)
 *  targets the existing /registro until the Reservar week view (#56) lands — the same mapping the
 *  Nosotros/Contacto pages use for their own Reservar CTA. */
const NAV: { href: Href; label: string; tag?: string }[] = [
  { href: "/", label: "Inicio" },
  { href: "/registro", label: "Clases", tag: "Hoy" },
  { href: "/precios", label: "Precios" },
  { href: "/nosotros" as Route, label: "Nosotros" },
  { href: "/contacto" as Route, label: "Contacto" },
  { href: "/entrar", label: "Entrar" },
];

/**
 * The shared public header + slide-in nav drawer (the mock's `cm-head` + `cm-drawer`), the single chrome
 * every marketing page wears. A client island because the open/close state is the only interactivity;
 * everything paints through the brand-token contract (bg-surface, border-line, text-accent…), so a RED
 * host and a Forge host render the same structure in their own palette. `brandId` selects the drawer
 * lockup from the brand registry — presentation only, never an authz input.
 *
 * The hamburger morphs to an X, the drawer slides from the left with a staggered nav reveal, and the
 * backdrop dismisses on tap. All motion is gated behind `motion-safe:` so a reduced-motion visitor gets
 * the final state instantly (no delayed-invisible nav items).
 */
export function PublicHeader({ brandId }: { brandId: BrandId }) {
  const [open, setOpen] = useState(false);
  const Logo = brands[brandId].logo;
  const close = () => setOpen(false);

  return (
    // Fragment, not a wrapper: the drawer + backdrop are SIBLINGS of the sticky header, never nested in
    // it — the header's `backdrop-blur` establishes a containing block, which would re-anchor their
    // `fixed` positioning to the header instead of the viewport.
    <>
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-line bg-canvas/90 px-6 py-4 backdrop-blur">
        <button
          type="button"
          aria-label="Menú"
          aria-expanded={open}
          onClick={() => setOpen(true)}
          className="relative flex h-6 w-7 flex-col justify-center gap-1.5"
        >
          <span
            className={`h-px w-5 bg-muted motion-safe:transition-transform ${
              open ? "translate-y-[3.5px] rotate-45" : ""
            }`}
          />
          <span
            className={`h-px bg-muted motion-safe:transition-all ${
              open ? "w-5 -translate-y-[3.5px] -rotate-45" : "w-3.5"
            }`}
          />
        </button>

        <Link
          href="/entrar"
          className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted hover:text-fg"
        >
          Entrar
        </Link>
      </header>

      {/* Backdrop — dismisses the drawer. Hidden from AT + pointer events when closed. */}
      <div
        aria-hidden
        onClick={close}
        className={`fixed inset-0 z-40 bg-black/60 motion-safe:transition-opacity ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      <aside
        aria-label="Menú de navegación"
        inert={!open}
        className={`fixed inset-y-0 left-0 z-50 flex w-[286px] flex-col border-r border-line bg-surface shadow-2xl motion-safe:transition-transform ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between border-b border-line px-6 py-5">
          <Logo size={16} />
          <button
            type="button"
            aria-label="Cerrar"
            onClick={close}
            className="text-lg leading-none text-muted hover:text-fg"
          >
            ✕
          </button>
        </div>

        <nav className="flex-1 py-3">
          {NAV.map((item, i) => (
            <Link
              key={item.label}
              href={item.href}
              onClick={close}
              style={
                open ? { transitionDelay: `${0.08 + i * 0.045}s` } : undefined
              }
              className={`flex items-center justify-between px-6 py-4 hover:bg-sunk motion-safe:transition-all ${
                open ? "translate-x-0 opacity-100" : "-translate-x-4 opacity-0"
              }`}
            >
              <span className="text-[15px] font-medium text-fg">
                {item.label}
              </span>
              {item.tag && (
                <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-accent">
                  {item.tag}
                </span>
              )}
            </Link>
          ))}
        </nav>

        <div className="border-t border-line px-6 py-6">
          <Link
            href="/registro"
            onClick={close}
            className="flex justify-center bg-accent px-5 py-3.5 text-xs font-bold uppercase tracking-[0.16em] text-white hover:opacity-90"
          >
            Reservar clase
          </Link>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
            Lun a Sáb · 05:30 – 22:00
          </p>
        </div>
      </aside>
    </>
  );
}
