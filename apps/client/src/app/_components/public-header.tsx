"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import type { Route } from "next";
import Link from "next/link";
import { usePathname } from "next/navigation";

import { footerCtaVista, navClasesVista } from "../../lib/reserva-vista";

/** The typed-Route href next/link accepts (the `typedRoutes` union). Typing the table with this — not a
 *  bare `string` — keeps each literal below validated against the real route map at build (the same seam
 *  @gym/ui's TabBar uses to stay brand-neutral), instead of widening to an unchecked string. */
type Href = ComponentProps<typeof Link>["href"];

/** The public nav destinations, in drawer order (mock `cm-dnav`). The drawer is the nav hub for the
 *  sibling marketing pages: Nosotros (#52) and Contacto (#53) land alongside this landing off the same
 *  base, so they are typed `as Route` — Next's sanctioned marker for an intentional cross-slice route
 *  that resolves on assembly (the guard stays live for every co-present route). The "Clases" row and the
 *  drawer's footer CTA are the booking funnel on Cupo (owner ruling — login-first funnel), always
 *  /reservar; on Lista (no booking surface at all — #326/#332) both become "Mi saldo" → /saldo, read off
 *  `navClasesVista`/`footerCtaVista` (apps/client/src/lib/reserva-vista.ts) — the one place that branch
 *  lives, so this table never re-derives it. The guard on /reservar (Cupo) / /saldo (Lista) redirects an
 *  unauth visitor to /entrar, which is the one place "Crea tu cuenta" (→ /registro) is offered —
 *  registering is never the first stop. */
function navPublica(clases: { href: Href; label: string; tag: string | null }): { href: Href; label: string; tag?: string }[] {
  return [
    { href: "/", label: "Inicio" },
    { href: clases.href, label: clases.label, ...(clases.tag ? { tag: clases.tag } : {}) },
    { href: "/precios", label: "Precios" },
    { href: "/nosotros" as Route, label: "Nosotros" },
    { href: "/contacto" as Route, label: "Contacto" },
    { href: "/entrar", label: "Entrar" },
  ];
}

// The auth routes are full-viewport brand experiences (the login hero frames the
// form); the marketing header — whose own "Entrar" link would point at the page
// you are on — is chrome for the public marketing pages, not the sign-in gate. So
// it hides itself there. A client island (it needs the pathname); the brand logo
// is resolved on the server and passed in as an already-rendered node, so no brand
// import crosses into this file.
const RUTAS_SIN_HEADER = new Set(["/entrar", "/registro", "/restablecer"]);

/**
 * The shared public header + slide-in nav drawer (the mock's `cm-head` + `cm-drawer`), the single chrome
 * every marketing page wears. A client island because the open/close state (and the route it hides on)
 * is the only interactivity; everything paints through the brand-token contract (bg-surface, border-line,
 * text-accent…), so a RED host and a Forge host render the same structure in their own palette. The brand
 * lockup arrives as an already-rendered `logo` node (server-resolved) — presentation only, never an authz
 * input, and no brand import crosses into this client file.
 *
 * The hamburger morphs to an X, the drawer slides from the left with a staggered nav reveal, and the
 * backdrop dismisses on tap. All motion is gated behind `motion-safe:` so a reduced-motion visitor gets
 * the final state instantly (no delayed-invisible nav items).
 *
 * `signedIn` (server-resolved via `getClaims()` in the layout — never re-derived here) swaps the
 * top-right "Entrar" link for a members' affordance into the booking-funnel destination, so a
 * returning member isn't offered the sign-in page they already passed (B5). That destination —
 * and the "Clases" row / drawer CTA below it — is login-first regardless of `signedIn`, and is
 * mode-aware (#332): `/reservar` on Cupo, `/saldo` on Lista (`reservasHabilitadas`, resolved
 * server-side in the layout from the HOST's gym — the same pre-login read every other public
 * marketing page already does).
 */
export function PublicHeader({
  logo,
  signedIn,
  reservasHabilitadas,
}: {
  readonly logo: ReactNode;
  readonly signedIn: boolean;
  readonly reservasHabilitadas: boolean;
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const clases = navClasesVista(reservasHabilitadas);
  const cta = footerCtaVista(reservasHabilitadas);

  if (RUTAS_SIN_HEADER.has(pathname)) return null;


  return (
    // Fragment, not a wrapper: the drawer + backdrop are SIBLINGS of the header, never nested in it —
    // keeps their `fixed` positioning anchored to the viewport regardless of any header treatment
    // (a blur/transform on an ancestor would otherwise re-anchor it).
    <>
      {/* Transparent floating header (mock `cm-head`/`scrhead`: no fill, no border, no blur — it
          sits in normal flow and scrolls with the page, it doesn't pin itself over it). */}
      <header className="flex items-center justify-between px-6 py-4">
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
          href={signedIn ? clases.href : "/entrar"}
          className="text-[11px] font-semibold uppercase tracking-[0.16em] text-muted hover:text-fg"
        >
          {signedIn ? "Mi cuenta" : "Entrar"}
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
          {logo}
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
          {navPublica(clases).map((item, i) => (
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
            href={cta.href}
            onClick={close}
            className="flex justify-center bg-accent px-5 py-3.5 text-xs font-bold uppercase tracking-[0.16em] text-accent-fg hover:opacity-90"
          >
            {cta.label}
          </Link>
          <p className="mt-4 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted">
            Lun a Sáb · 05:30 – 22:00
          </p>
        </div>
      </aside>
    </>
  );
}
