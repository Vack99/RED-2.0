import * as React from "react";
import { cn } from "@/lib/utils";

// ──────────────────────────────────────────────────────────────
// Skeleton — a sunk-surface placeholder with a left-to-right shimmer.
// Pure/presentational (no hooks) so it renders on the server and drops
// into loading.tsx fallbacks. The shimmer is the existing `forge-flash`
// keyframe on an absolutely-positioned highlight bar; the global
// reduced-motion block neutralizes its duration, leaving a clean static
// block. Marked aria-hidden — it carries no information.
// Matches the inline-style idiom of sibling primitives in ui.tsx.
// ──────────────────────────────────────────────────────────────

/** A CSS length: a number is treated as px, a string passes through (`%`, `rem`…). */
type Len = number | string;

/**
 * Resolve the box style for a skeleton from its props. Pure (no DOM) so the
 * sizing rules are unit-testable. `circle` forces a 1:1 box + pill radius and
 * `text` collapses to a single line height with a default width.
 */
export function skeletonStyle({
  width,
  height,
  radius,
  circle,
  text,
}: {
  width?: Len;
  height?: Len;
  radius?: Len;
  circle?: boolean;
  text?: boolean;
}): React.CSSProperties {
  const w = width ?? (text ? "100%" : circle ? 40 : "100%");
  const h = height ?? (circle ? w : text ? 12 : 16);
  return {
    width: w,
    height: circle ? w : h,
    borderRadius: circle ? 999 : (radius ?? 0),
  };
}

export function Skeleton({
  width,
  height,
  radius,
  circle = false,
  text = false,
  className,
  style,
}: {
  width?: Len;
  height?: Len;
  radius?: Len;
  /** Avatar variant: square box, pill radius, height mirrors width. */
  circle?: boolean;
  /** Text-line variant: short default height + full width. */
  text?: boolean;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <div
      aria-hidden
      className={cn("relative overflow-hidden", className)}
      style={{
        background: "var(--sunk)",
        ...skeletonStyle({ width, height, radius, circle, text }),
        ...style,
      }}
    >
      {/* Shimmer highlight — sweeps left→right on a loop via `forge-flash`.
          Reduced-motion users get the static block (duration neutralized
          globally), so the placeholder still reads on its own. */}
      <div
        className="pointer-events-none absolute inset-y-0"
        style={{
          left: 0,
          width: "60%",
          background:
            "linear-gradient(90deg, transparent, color-mix(in srgb, var(--fg) 7%, transparent), transparent)",
          animation: "forge-flash 1.4s cubic-bezier(.32,.72,0,1) infinite",
        }}
      />
    </div>
  );
}
