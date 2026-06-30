/**
 * Swipe-to-navigate gesture state machine — pure, framework-free, unit-tested.
 *
 * A horizontal swipe walks to the previous/next item; a vertical drag must be
 * left entirely to native scrolling. The component layer is a thin adapter: it
 * holds the {@link SwipeState} in a ref, feeds DOM touch events in as
 * {@link SwipeInput}, applies the returned `dx` as a `translateX`, and acts on
 * the `navigate` intent. All the decisions — axis-lock, engage threshold,
 * edge-gutter (so the OS back-gesture wins), rubber-banding at the ends, and
 * single-touch guarding — live here so they can be tested without a DOM.
 */

export type SwipeAxis = "h" | "v" | null;

export interface SwipeState {
  /** Touch origin, captured on `start`. */
  startX: number;
  startY: number;
  /** Horizontal offset to apply to the content (post rubber-band); 0 unless horizontally committed. */
  dx: number;
  /** Which axis the gesture committed to once past the engage threshold. */
  axis: SwipeAxis;
  /** Whether a gesture is currently being tracked. */
  active: boolean;
}

export interface SwipeConfig {
  /** Pixels of movement before the gesture commits to an axis. */
  engage: number;
  /** Horizontal distance that triggers navigation on release. */
  trigger: number;
  /** Pixels from either viewport edge reserved for the OS back-gesture. */
  edgeGutter: number;
  /** Fraction of the raw delta applied when there is no neighbor in that direction. */
  rubberBand: number;
}

export const DEFAULT_SWIPE_CONFIG: SwipeConfig = {
  engage: 12,
  trigger: 80,
  edgeGutter: 28,
  rubberBand: 0.25,
};

export interface SwipeContext {
  /** Used to detect the right-edge gutter. */
  viewportWidth: number;
  /** Is there a previous item to swipe right toward? */
  hasPrev: boolean;
  /** Is there a next item to swipe left toward? */
  hasNext: boolean;
  config?: Partial<SwipeConfig>;
}

export type SwipeInput =
  | { kind: "start"; x: number; y: number; touchCount: number }
  | { kind: "move"; x: number; y: number; touchCount: number }
  | { kind: "end" }
  | { kind: "cancel" };

export type SwipeNav = "prev" | "next" | null;

export interface SwipeResult {
  state: SwipeState;
  /** Navigation intent — only ever non-null on an `end` that crossed the trigger. */
  navigate: SwipeNav;
}

export const idleSwipe = (): SwipeState => ({ startX: 0, startY: 0, dx: 0, axis: null, active: false });

const still = (state: SwipeState): SwipeResult => ({ state, navigate: null });

/** Advance the gesture state machine by one input event. */
export function swipeStep(state: SwipeState, input: SwipeInput, ctx: SwipeContext): SwipeResult {
  const cfg = { ...DEFAULT_SWIPE_CONFIG, ...ctx.config };

  switch (input.kind) {
    case "start": {
      // Single-touch only, and yield the screen-edge gutters to the OS back-gesture.
      const inGutter = input.x <= cfg.edgeGutter || input.x >= ctx.viewportWidth - cfg.edgeGutter;
      if (input.touchCount !== 1 || inGutter) return still(idleSwipe());
      return still({ startX: input.x, startY: input.y, dx: 0, axis: null, active: true });
    }

    case "move": {
      if (!state.active) return still(state);
      // A second finger landing abandons the gesture.
      if (input.touchCount !== 1) return still(idleSwipe());

      const dxRaw = input.x - state.startX;
      const dyRaw = input.y - state.startY;

      let axis = state.axis;
      if (axis === null) {
        // Decide the axis only once movement is past the engage threshold.
        if (Math.abs(dxRaw) < cfg.engage && Math.abs(dyRaw) < cfg.engage) {
          return still({ ...state, dx: 0 });
        }
        axis = Math.abs(dxRaw) > Math.abs(dyRaw) ? "h" : "v";
      }

      // Vertical (or undecided-then-vertical): never translate — let native scroll own it.
      if (axis !== "h") return still({ ...state, axis, dx: 0 });

      // Horizontal: track the finger, resisting when there is no neighbor that way.
      const hasNeighbor = dxRaw < 0 ? ctx.hasNext : ctx.hasPrev;
      const dx = hasNeighbor ? dxRaw : dxRaw * cfg.rubberBand;
      return still({ ...state, axis, dx });
    }

    case "end": {
      let navigate: SwipeNav = null;
      if (state.active && state.axis === "h") {
        if (state.dx <= -cfg.trigger && ctx.hasNext) navigate = "next";
        else if (state.dx >= cfg.trigger && ctx.hasPrev) navigate = "prev";
      }
      return { state: idleSwipe(), navigate };
    }

    case "cancel":
      return still(idleSwipe());
  }
}
