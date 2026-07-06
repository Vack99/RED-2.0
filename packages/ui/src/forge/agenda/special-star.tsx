import * as React from "react";

/**
 * The filled ★ that marks an evento especial across the agenda surfaces (card,
 * week row, quick-glance, editor). Distinct from the kit's stroke-only `star`
 * Icon — this is a solid yellow glyph — so it lives here as the single home for
 * the four consumers that would otherwise inline the same path.
 */
export function SpecialStar({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="var(--yellow)" style={{ flex: "none" }} aria-hidden="true">
      <path d="M10 2l2.5 5.2 5.5.8-4 3.9 1 5.6L10 14.8 5 17.5l1-5.6-4-3.9 5.5-.8L10 2z" />
    </svg>
  );
}
