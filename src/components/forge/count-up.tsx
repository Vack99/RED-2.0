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
  // Seed the FIRST paint at 0 so the mount can tween up — EXCEPT under reduced
  // motion, where we seed the final value so those users never see a 0→N flash
  // (the effect would settle to `value` only after the first paint). The ref
  // tracks where the NEXT tween should start (the last value we settled on).
  const [shown, setShown] = React.useState(() => (prefersReducedMotion() ? value : 0));
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
