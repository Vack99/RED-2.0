"use client";

import * as React from "react";
import { createPortal } from "react-dom";
import { SheetFocusContext } from "./sheet-focus-context";

/**
 * Slide-up bottom sheet with scrim + drag handle. Fixed to the VIEWPORT
 * (via a body portal) but the panel is centered into the app's phone-width
 * column, so it works full-bleed on a phone and centered on desktop.
 *
 * ── Why a portal ──
 * The app shell makes `<main>` the single scroller and wraps every screen in a
 * `template.tsx` whose `forge-enter` animation leaves a residual `transform`.
 * A transformed ancestor becomes the containing block for `position: fixed`,
 * so a sheet rendered in-place would be anchored to the (over-tall, scrolled)
 * screen content instead of the viewport — and focusing a field inside it would
 * scroll `<main>` to chase the off-screen panel, jumping the whole page.
 * Portaling to `document.body` escapes every transformed ancestor: `fixed`
 * resolves against the viewport and the panel can never move the background.
 *
 * ── Lifecycle ──
 * `mounted` keeps the panel in the DOM (deferred 320ms on close so the exit
 * animation can play); `shown` drives the transform/scrim. On open we mount at
 * the CLOSED position, then flip `shown` on the next animation frame so the CSS
 * transition runs translateY(100%) → translateY(0). Without that one-frame
 * delay the panel mounts already at translateY(0) and pops in with no slide.
 *
 * ── Shielding ──
 * While open we lock the background scroller, move focus to the first marked
 * field WITHOUT scrolling, close on Esc, and restore focus to the trigger on
 * close. Overscroll is contained by `.forge-scroll` (globals.css) on the inner
 * scroll area. All of it lives here so every sheet inherits the behaviour.
 */
export function Sheet({
  open,
  onClose,
  children,
  maxHeight = "86dvh",
}: {
  open: boolean;
  onClose: () => void;
  children: React.ReactNode;
  maxHeight?: string;
}) {
  const [mounted, setMounted] = React.useState(open);
  const [shown, setShown] = React.useState(false);
  const panelRef = React.useRef<HTMLDivElement | null>(null);
  // The element that had focus when the sheet opened, so we can restore it on close.
  const restoreFocusRef = React.useRef<HTMLElement | null>(null);

  // Portals can only target the DOM after mount (SSR has no `document`). Reading
  // `document.body` once on mount keeps SSR and the first client render at `null`
  // (no hydration mismatch), then upgrades to the real target.
  const [portalEl, setPortalEl] = React.useState<HTMLElement | null>(null);
  React.useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional client-only mount read; SSR/first render stay null to avoid a hydration mismatch
    setPortalEl(document.body);
  }, []);

  // Mount on open; defer unmount on close so the exit transition can play.
  React.useEffect(() => {
    if (open) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional mount-on-open; unmount is deferred 320ms for the exit animation
      setMounted(true);
    } else {
      // Drive the exit transition, then unmount after it finishes.
      setShown(false);
      const t = setTimeout(() => setMounted(false), 320);
      return () => clearTimeout(t);
    }
  }, [open]);

  // Once mounted at the closed position, flip `shown` on the next frame so the
  // open transition actually runs (set inside rAF, after the closed frame paints).
  React.useEffect(() => {
    if (!mounted || !open) return;
    const r = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(r);
  }, [mounted, open]);

  // Lock the app's background scroller while the sheet is mounted. The shell
  // makes `<main>` the single scroller; freezing its overflow stops background
  // scroll/rubber-band behind the scrim. `.forge-scroll` hides the scrollbar, so
  // toggling overflow shifts no layout. Restored on unmount.
  React.useEffect(() => {
    if (!mounted) return;
    const scroller = document.querySelector<HTMLElement>("main.forge-scroll");
    if (!scroller) return;
    const prevOverflow = scroller.style.overflow;
    scroller.style.overflow = "hidden";
    return () => {
      scroller.style.overflow = prevOverflow;
    };
  }, [mounted]);

  // Capture the trigger on open so focus can return to it on close.
  React.useEffect(() => {
    if (open) restoreFocusRef.current = document.activeElement as HTMLElement | null;
  }, [open]);

  // Move focus into the panel — WITHOUT scrolling — once the enter transition
  // settles. Focusing after the slide (rather than on mount, when the panel sits
  // at translateY(100%) off-screen) plus `preventScroll` guarantees the
  // background never jumps to chase the field. Driven by `transitionend` so it
  // self-adjusts under prefers-reduced-motion; a timeout backstops the event in
  // case it is coalesced.
  React.useEffect(() => {
    if (!shown) return;
    const panel = panelRef.current;
    if (!panel) return;
    let done = false;
    const focusFirst = () => {
      if (done) return;
      done = true;
      const target =
        panel.querySelector<HTMLElement>("[data-autofocus]") ??
        panel.querySelector<HTMLElement>(
          "input, textarea, select, button, [tabindex]:not([tabindex='-1'])",
        );
      target?.focus({ preventScroll: true });
    };
    const onEnd = (e: TransitionEvent) => {
      if (e.target === panel && e.propertyName === "transform") focusFirst();
    };
    panel.addEventListener("transitionend", onEnd);
    const t = setTimeout(focusFirst, 360);
    return () => {
      panel.removeEventListener("transitionend", onEnd);
      clearTimeout(t);
    };
  }, [shown]);

  // On close (still mounted, but open=false), return focus to the trigger —
  // again without scrolling, for the same reason as the open-focus above.
  React.useEffect(() => {
    if (!mounted || open) return;
    const el = restoreFocusRef.current;
    if (el && document.contains(el)) el.focus({ preventScroll: true });
  }, [mounted, open]);

  // Esc closes — the keyboard equivalent of tapping the scrim.
  React.useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!mounted || !portalEl) return null;

  return createPortal(
    <div className="fixed inset-0 z-50" style={{ pointerEvents: open ? "auto" : "none" }}>
      <div
        onClick={onClose}
        className="absolute inset-0 transition-[background] duration-200"
        style={{ background: shown ? "var(--scrim)" : "transparent" }}
      />
      {/* Match the app shell: full-bleed on phones, centered 440 column on sm+ (desktop frame). */}
      <div className="absolute inset-x-0 bottom-0 mx-auto w-full sm:max-w-[440px]">
        <div
          ref={panelRef}
          role="dialog"
          aria-modal="true"
          className="flex flex-col border-t border-line bg-canvas"
          style={{
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            maxHeight,
            transform: shown ? "translateY(0)" : "translateY(100%)",
            transition: "transform 320ms cubic-bezier(.32,.72,0,1)",
            paddingBottom: 24,
          }}
        >
          <div className="flex justify-center" style={{ padding: "10px 0 4px" }}>
            <div style={{ width: 38, height: 4, borderRadius: 999, background: "var(--line)" }} />
          </div>
          {/* Tell descendant Inputs the Sheet owns initial focus (it focuses
              `[data-autofocus]` after the slide), so they don't self-focus on
              mount while still below the viewport. */}
          <SheetFocusContext.Provider value={true}>
            <div className="forge-scroll overflow-auto">{children}</div>
          </SheetFocusContext.Provider>
        </div>
      </div>
    </div>,
    portalEl,
  );
}
