/**
 * Pure auth-gate routing decision, split out of proxy.ts so it is testable
 * without Next's request/cookie machinery. Given whether the request is
 * authenticated and the path it targets, return where to redirect — or null to
 * let it through.
 *
 *  - unauthenticated + not on /login  -> "/login"
 *  - authenticated + on /login        -> "/inicio"
 *  - otherwise                        -> null (pass through)
 */
export function decideRedirect(authed: boolean, pathname: string): string | null {
  const isLogin = pathname === "/login";
  if (!authed && !isLogin) return "/login";
  if (authed && isLogin) return "/inicio";
  return null;
}
