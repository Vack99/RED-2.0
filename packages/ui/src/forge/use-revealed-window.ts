"use client";

import * as React from "react";

// ──────────────────────────────────────────────────────────────
// useRevealedWindow — windowed initial paint for a long roster.
//
// The server (and the matching first hydration render) emit only the first
// `size` rows — enough to overfill the tallest plausible viewport at these
// rosters' ~70px row height — then a mount effect reveals the full list. This
// halves the initial HTML/SSR cost of a several-hundred-row roster with no data
// change (every row is already in the caller's list) and no visible shift: the
// window already exceeds one screen, so the remaining rows grow in below the
// fold. The caller keeps filtering/sorting/search over its FULL list; only how
// many of that list is painted is gated, and `list.length` stays exact for the
// caller's own counts/empty-state.
//
// `revealAll` is returned so a caller can thread it into other post-mount wiring
// (e.g. a FLIP layout effect that must re-measure the newly-mounted rows).
// ──────────────────────────────────────────────────────────────

/**
 * Paint `list.slice(0, size)` on the server + first client render, then reveal
 * the whole `list` on the frame after mount.
 *
 * @param list the full, already-filtered/sorted list the caller renders.
 * @param size how many rows to paint before the reveal (default 50).
 * @returns `visible` (the windowed-then-full slice) and `revealAll` (whether the
 *          post-mount reveal has fired).
 */
export function useRevealedWindow<T>(
  list: T[],
  size = 50,
): { visible: T[]; revealAll: boolean } {
  const [revealAll, setRevealAll] = React.useState(false);
  React.useEffect(() => {
    // Reveal on the frame after the first paint, so the initial paint stays the
    // window. rAF (not a bare setState in the effect body) also keeps this off the
    // synchronous commit path.
    const id = requestAnimationFrame(() => setRevealAll(true));
    return () => cancelAnimationFrame(id);
  }, []);
  const visible = revealAll ? list : list.slice(0, size);
  return { visible, revealAll };
}
