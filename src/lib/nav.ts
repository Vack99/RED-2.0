/**
 * A one-shot "I just navigated here from within the app" breadcrumb.
 *
 * The client-ficha back button wants to `router.back()` ONLY when the ficha was
 * reached by an in-app push (so the browser restores the roster's scroll
 * position and plays a pop); on a deep link / refresh it must fall back to the
 * roster instead. `window.history.length` cannot tell these apart — browsers
 * seed it at 1–2 and it counts pre-app entries, so `length > 1` is true even on
 * a cold deep link, where `router.back()` would leave the app entirely.
 *
 * Instead, the in-app links into the ficha ARM this breadcrumb on click; the
 * back handler CONSUMES it (read-and-clear). Present ⇒ the immediately preceding
 * navigation was our own push ⇒ back is safe. Absent ⇒ deep link / refresh ⇒
 * fall back. Clearing on read keeps it from going stale across a later cold load
 * in the same tab. sessionStorage (not a module variable) so it survives the
 * full document reload that a hard navigation to the ficha would cause.
 */
const KEY = "forge:cameFromApp";

/** Mark that the next navigation is an in-app push (call from a Link's onClick). */
export function markInAppNav(): void {
  try {
    sessionStorage.setItem(KEY, "1");
  } catch {
    // Private mode / storage disabled — degrade to the safe fallback (push).
  }
}

/** Read-and-clear the breadcrumb: true exactly once after `markInAppNav`. */
export function consumeInAppNav(): boolean {
  try {
    const hit = sessionStorage.getItem(KEY) === "1";
    if (hit) sessionStorage.removeItem(KEY);
    return hit;
  } catch {
    return false;
  }
}
