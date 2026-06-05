"use client";

import * as React from "react";
import { prefersReducedMotion } from "@/lib/motion";
import { Tnum } from "./ui";

/**
 * Eased value at progress `t` (0→1) between `from` and `to`, rounded to an int.
 * Ease-out cubic — fast then settling, matching the hero stat feel. Pure so it
 * can be unit-tested without a DOM or rAF.
 */
export function countUpStep(from: number, to: number, t: number): number {
  const clamped = t <= 0 ? 0 : t >= 1 ? 1 : t;
  const eased = 1 - Math.pow(1 - clamped, 3);
  return Math.round(from + (to - from) * eased);
}

/** Animated integer counter (ease-out cubic), used for hero stats. */
export function CountUp({
  value,
  duration = 500,
  className,
  style,
  format = String,
}: {
  value: number;
  duration?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Maps the current integer to its display string (e.g. peso formatting). */
  format?: (n: number) => string;
}) {
  // Seed the first paint at 0 on BOTH server and client so SSR and hydration
  // agree: prefersReducedMotion() reads matchMedia, which is undefined on the
  // server, so seeding the initial state from it desyncs the first render (a
  // React hydration mismatch). The effect tweens up from here; reduced-motion
  // users get ms=0 below, settling on the final value one frame after paint
  // instead of crawling. The ref tracks where the NEXT tween should start.
  const [shown, setShown] = React.useState(0);
  const fromRef = React.useRef(shown);

  React.useEffect(() => {
    const start = fromRef.current;
    const to = value;
    if (start === to) return;

    // rAF motion is NOT covered by the global reduced-motion CSS block, so a
    // zero duration makes the first tick land on `to` and settle immediately.
    const ms = prefersReducedMotion() ? 0 : duration;
    const t0 = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const t = ms <= 0 ? 1 : (now - t0) / ms;
      setShown(countUpStep(start, to, t));
      if (t < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);

  return (
    <Tnum className={className} style={style}>
      {format(shown)}
    </Tnum>
  );
}
