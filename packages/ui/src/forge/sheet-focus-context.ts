"use client";

import * as React from "react";

/**
 * Marks a subtree as "a Sheet owns initial focus here."
 *
 * A Sheet mounts its panel off-screen at translateY(100%) and slides it up, so
 * the right moment to move focus is *after* the slide settles — and without
 * scrolling (see `sheet.tsx`). An `Input` with `autoFocus` would otherwise
 * focus itself on mount, which fights the Sheet's post-transition focus and
 * focuses a field that is still below the viewport. When this context is `true`,
 * an `Input` defers to the Sheet (it still emits `data-autofocus` as the marker
 * the Sheet queries); when `false` (the default, i.e. no Sheet ancestor) the
 * `Input` focuses itself on mount with `preventScroll`.
 *
 * Context propagates across the Sheet's `createPortal`, so an Input inside a
 * portalled panel still reads `true`.
 */
export const SheetFocusContext = React.createContext(false);
