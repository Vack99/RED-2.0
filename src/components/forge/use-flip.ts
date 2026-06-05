"use client";

import * as React from "react";
import { prefersReducedMotion } from "@/lib/motion";

// ──────────────────────────────────────────────────────────────
// useFlip — library-free FLIP (First, Last, Invert, Play) list reorder.
//
// Each render, the hook records the screen position of every tracked child
// (keyed by a stable id). When the list reorders, the *new* layout is the
// "Last" position; we compute the delta back to the "First" position, apply
// it as an inverted transform synchronously (before paint, via
// useLayoutEffect), then transition that transform away on the canonical
// easing curve so each row glides from where it was to where it is.
//
// Only rows present BEFORE and AFTER a change animate — rows that enter or
// leave are left to mount/unmount normally, so filter/search length changes
// never throw or jump an untracked node. Under reduced motion the hook is a
// no-op (positions are still tracked so the first post-reduce reorder is
// clean, but no transform is ever applied).
// ──────────────────────────────────────────────────────────────

/** A captured top-left position in viewport space. */
export type Point = { x: number; y: number };

/** A FLIP translation: how far to move a node to invert a layout change. */
export type Delta = { dx: number; dy: number };

/**
 * The inverted translation that visually returns a node from its new
 * position (`next`) to its previous one (`prev`). Pure — the heart of FLIP,
 * unit-tested without a DOM.
 */
export function flipDelta(prev: Point, next: Point): Delta {
  return { dx: prev.x - next.x, dy: prev.y - next.y };
}

/** Whether a delta is large enough to be worth animating (≥1px on an axis). */
export function isMeasurableDelta(d: Delta): boolean {
  return Math.abs(d.dx) >= 1 || Math.abs(d.dy) >= 1;
}

const DURATION_MS = 220;
const EASING = "cubic-bezier(.32,.72,0,1)";

/**
 * Invert + play one node: snap it back to its old spot by `delta` with no
 * transition, then on the next frame transition the transform to zero so it
 * glides to where layout actually put it. Kept as a module-level helper that
 * takes the node as a parameter so the imperative style writes are local and
 * self-contained.
 */
function playFlip(node: HTMLElement, delta: Delta): void {
  node.style.transition = "none";
  node.style.transform = `translate(${delta.dx}px, ${delta.dy}px)`;
  requestAnimationFrame(() => {
    node.style.transition = `transform ${DURATION_MS}ms ${EASING}`;
    node.style.transform = "";
  });
}

/**
 * Track a list and animate reorders with FLIP.
 *
 * Returns a `ref(id)` factory: spread the returned callback ref onto each
 * tracked row, passing its stable id. Reorder the list however you like
 * (sort/filter/search) — rows that stay in the DOM slide to their new spot.
 *
 * @param deps values that, when changed, signal the list may have reordered
 *             (e.g. the sort key, filters, query). The hook measures after
 *             every commit; these keep the dependency intent explicit.
 */
export function useFlip(deps: React.DependencyList) {
  // Live DOM nodes by id (the current commit's tracked rows).
  const nodes = React.useRef(new Map<string, HTMLElement>());
  // Positions measured at the END of the previous commit — the "First" rects.
  const prev = React.useRef(new Map<string, Point>());

  const setRef = React.useCallback(
    (id: string) => (node: HTMLElement | null) => {
      if (node) nodes.current.set(id, node);
      else nodes.current.delete(id);
    },
    [],
  );

  React.useLayoutEffect(() => {
    const reduce = prefersReducedMotion();
    const next = new Map<string, Point>();
    const before = prev.current;

    nodes.current.forEach((node, id) => {
      const rect = node.getBoundingClientRect();
      const here: Point = { x: rect.left, y: rect.top };
      next.set(id, here);

      if (reduce) return;
      const was = before.get(id);
      if (!was) return; // entering row — let it mount normally.

      const delta = flipDelta(was, here);
      if (isMeasurableDelta(delta)) playFlip(node, delta);
    });

    prev.current = next;
    // We intentionally re-measure on the supplied reorder signals.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return setRef;
}
