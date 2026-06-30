/**
 * Visual-viewport helpers for mobile soft-keyboard handling.
 *
 * On iOS Safari / Android Chrome the on-screen keyboard shrinks the *visual*
 * viewport but NOT the *layout* viewport, so `position: fixed; bottom: 0`
 * elements (e.g. a bottom sheet) stay anchored behind the keyboard. This pure
 * helper computes how many pixels the keyboard overlaps the layout viewport's
 * bottom, so the UI can lift/cap a panel above it.
 */

/**
 * Pixels the soft keyboard (or any visual-viewport shrink) covers at the
 * bottom of the layout viewport. Clamped to >= 0.
 *
 * @param layoutViewportHeight typically `window.innerHeight`
 * @param visual the `window.visualViewport`'s current `{ height, offsetTop }`
 */
export function keyboardInset(
  layoutViewportHeight: number,
  visual: { height: number; offsetTop: number },
): number {
  return Math.max(0, layoutViewportHeight - visual.height - visual.offsetTop);
}
