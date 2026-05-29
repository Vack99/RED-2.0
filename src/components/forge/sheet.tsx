"use client";

import * as React from "react";

/**
 * Slide-up bottom sheet with scrim + drag handle. Fixed to the viewport
 * but the panel is centered into the app's phone-width column, so it works
 * full-bleed on a phone and centered on desktop. Mirrors the prototype's
 * Sheet (animated mount/unmount, scrim blur, hard top corners radius).
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

  React.useEffect(() => {
    if (open) {
      setMounted(true);
    } else {
      const t = setTimeout(() => setMounted(false), 320);
      return () => clearTimeout(t);
    }
  }, [open]);

  if (!mounted) return null;

  return (
    <div className="fixed inset-0 z-50" style={{ pointerEvents: open ? "auto" : "none" }}>
      <div
        onClick={onClose}
        className="absolute inset-0 transition-[background] duration-200"
        style={{ background: open ? "var(--scrim)" : "transparent" }}
      />
      <div className="absolute inset-x-0 bottom-0 mx-auto w-full" style={{ maxWidth: 440 }}>
        <div
          className="flex flex-col border-t border-line bg-canvas"
          style={{
            borderTopLeftRadius: 26,
            borderTopRightRadius: 26,
            maxHeight,
            transform: open ? "translateY(0)" : "translateY(100%)",
            transition: "transform 320ms cubic-bezier(.32,.72,0,1)",
            paddingBottom: 24,
          }}
        >
          <div className="flex justify-center" style={{ padding: "10px 0 4px" }}>
            <div style={{ width: 38, height: 4, borderRadius: 999, background: "var(--line)" }} />
          </div>
          <div className="forge-scroll overflow-auto">{children}</div>
        </div>
      </div>
    </div>
  );
}
