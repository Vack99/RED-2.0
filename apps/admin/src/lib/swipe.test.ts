import { describe, expect, it } from "vitest";

import { DEFAULT_SWIPE_CONFIG, idleSwipe, swipeStep, type SwipeContext, type SwipeState } from "./swipe";

/** A roomy phone viewport with both neighbors available, unless overridden. */
const ctx = (over: Partial<SwipeContext> = {}): SwipeContext => ({
  viewportWidth: 390,
  hasPrev: true,
  hasNext: true,
  ...over,
});

/** Drive a fresh gesture from start through the given moves, returning the last result. */
function gesture(startX: number, startY: number, moves: Array<[number, number]>, c = ctx()) {
  let state: SwipeState = swipeStep(idleSwipe(), { kind: "start", x: startX, y: startY, touchCount: 1 }, c).state;
  let last = { state, navigate: null as ReturnType<typeof swipeStep>["navigate"] };
  for (const [x, y] of moves) {
    last = swipeStep(state, { kind: "move", x, y, touchCount: 1 }, c);
    state = last.state;
  }
  return last;
}

describe("swipeStep — arming the gesture", () => {
  it("arms on a single touch started away from the screen edges", () => {
    const { state } = swipeStep(idleSwipe(), { kind: "start", x: 195, y: 300, touchCount: 1 }, ctx());
    expect(state.active).toBe(true);
    expect(state.axis).toBeNull();
    expect(state.dx).toBe(0);
  });

  it("does NOT arm on a multi-touch gesture (pinch-zoom guard)", () => {
    const { state } = swipeStep(idleSwipe(), { kind: "start", x: 195, y: 300, touchCount: 2 }, ctx());
    expect(state.active).toBe(false);
  });

  it("does NOT arm inside the left edge gutter (yields to the OS back-gesture)", () => {
    const { state } = swipeStep(idleSwipe(), { kind: "start", x: 8, y: 300, touchCount: 1 }, ctx());
    expect(state.active).toBe(false);
  });

  it("does NOT arm inside the right edge gutter", () => {
    const { state } = swipeStep(idleSwipe(), { kind: "start", x: 384, y: 300, touchCount: 1 }, ctx());
    expect(state.active).toBe(false);
  });
});

describe("swipeStep — axis locking (the reported bug)", () => {
  it("does not translate while movement is below the engage threshold", () => {
    const { state } = gesture(195, 300, [[200, 305]]); // ~7px diagonal, under 12px engage
    expect(state.axis).toBeNull();
    expect(state.dx).toBe(0);
  });

  it("commits to VERTICAL on a mostly-vertical drag and never translates the page", () => {
    const { state } = gesture(195, 300, [[201, 360]]); // dy 60 >> dx 6
    expect(state.axis).toBe("v");
    expect(state.dx).toBe(0);
  });

  it("keeps dx at 0 for the rest of a vertical gesture even if it later drifts horizontally", () => {
    const { state } = gesture(195, 300, [
      [201, 360], // commits vertical
      [260, 380], // big horizontal drift afterwards
    ]);
    expect(state.axis).toBe("v");
    expect(state.dx).toBe(0); // axis stays locked — the page must not slide sideways
  });

  it("commits to HORIZONTAL on a mostly-horizontal drag and tracks the finger", () => {
    const { state } = gesture(195, 300, [[245, 306]]); // dx 50 >> dy 6
    expect(state.axis).toBe("h");
    expect(state.dx).toBe(50);
  });

  it("stays horizontal once committed even if the finger then drifts vertically", () => {
    const { state } = gesture(195, 300, [
      [245, 306], // commits horizontal
      [245, 380], // vertical drift afterwards
    ]);
    expect(state.axis).toBe("h");
    expect(state.dx).toBe(50);
  });
});

describe("swipeStep — rubber-banding at the roster ends", () => {
  it("rubber-bands a leftward drag when there is no next client", () => {
    const { state } = gesture(195, 300, [[95, 300]], ctx({ hasNext: false })); // dxRaw -100
    expect(state.axis).toBe("h");
    expect(state.dx).toBe(-100 * DEFAULT_SWIPE_CONFIG.rubberBand);
  });

  it("tracks the finger fully when the neighbor in that direction exists", () => {
    const { state } = gesture(195, 300, [[95, 300]], ctx({ hasNext: true }));
    expect(state.dx).toBe(-100);
  });
});

describe("swipeStep — navigation on release", () => {
  it("navigates to next after a committed left swipe past the trigger", () => {
    const g = gesture(295, 300, [[195, 305]], ctx()); // dx -100, past -80
    const { navigate, state } = swipeStep(g.state, { kind: "end" }, ctx());
    expect(navigate).toBe("next");
    expect(state).toEqual(idleSwipe()); // resets after release
  });

  it("navigates to prev after a committed right swipe past the trigger", () => {
    const g = gesture(95, 300, [[195, 305]], ctx()); // dx +100
    const { navigate } = swipeStep(g.state, { kind: "end" }, ctx());
    expect(navigate).toBe("prev");
  });

  it("does not navigate when the swipe is below the trigger distance", () => {
    const g = gesture(195, 300, [[245, 305]]); // dx +50, under 80
    const { navigate } = swipeStep(g.state, { kind: "end" }, ctx());
    expect(navigate).toBeNull();
  });

  it("does not navigate at a roster end (rubber-banded distance never reaches the trigger)", () => {
    const g = gesture(295, 300, [[155, 300]], ctx({ hasNext: false })); // dxRaw -140 → rubber -35
    const { navigate } = swipeStep(g.state, { kind: "end" }, ctx({ hasNext: false }));
    expect(navigate).toBeNull();
  });

  it("does not navigate when the gesture was vertical", () => {
    const g = gesture(195, 300, [[201, 420]]); // vertical
    const { navigate } = swipeStep(g.state, { kind: "end" }, ctx());
    expect(navigate).toBeNull();
  });
});

describe("swipeStep — interruptions", () => {
  it("resets to idle on cancel so the page never gets stuck mid-slide", () => {
    const g = gesture(295, 300, [[245, 305]]); // mid horizontal drag
    expect(g.state.dx).not.toBe(0);
    const { state, navigate } = swipeStep(g.state, { kind: "cancel" }, ctx());
    expect(state).toEqual(idleSwipe());
    expect(navigate).toBeNull();
  });

  it("abandons the gesture if a second finger lands mid-move", () => {
    const started = swipeStep(idleSwipe(), { kind: "start", x: 195, y: 300, touchCount: 1 }, ctx()).state;
    const { state } = swipeStep(started, { kind: "move", x: 245, y: 300, touchCount: 2 }, ctx());
    expect(state.active).toBe(false);
    expect(state.dx).toBe(0);
  });

  it("ignores moves when no gesture is active", () => {
    const { state, navigate } = swipeStep(idleSwipe(), { kind: "move", x: 245, y: 300, touchCount: 1 }, ctx());
    expect(state).toEqual(idleSwipe());
    expect(navigate).toBeNull();
  });
});
