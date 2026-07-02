/**
 * Reduced-motion helpers for JS/RAF-driven motion.
 *
 * The `@media (prefers-reduced-motion: reduce)` block in the shared motion.css
 * sheet neutralizes CSS animations/transitions automatically, but it does NOT reach
 * imperative motion such as `Element.scrollIntoView({ behavior: "smooth" })`.
 * Those call sites must consult this guard themselves.
 */

const REDUCE = "(prefers-reduced-motion: reduce)";

/** Whether the user has asked the OS to minimize non-essential motion. */
export function prefersReducedMotion(): boolean {
  return typeof matchMedia === "function" && matchMedia(REDUCE).matches;
}

/** ScrollBehavior to pass to scroll APIs: instant under reduced motion, smooth otherwise. */
export function scrollBehavior(): ScrollBehavior {
  return prefersReducedMotion() ? "auto" : "smooth";
}
