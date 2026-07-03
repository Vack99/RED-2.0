/**
 * Pure auth-gate routing decision, split out of proxy.ts so it is testable
 * without Next's request/cookie machinery. Given whether the request is
 * authenticated and the path it targets, return where to redirect — or null to
 * let it through.
 *
 *  - the dynamic /icon favicon route -> null (public; a tab paints its favicon
 *      before sign-in, so gating it would break the RED-admin login favicon)
 *  - unauthenticated + not on /login  -> "/login"
 *  - authenticated + on /login        -> "/inicio"
 *  - otherwise                        -> null (pass through)
 */
export function decideRedirect(authed: boolean, pathname: string): string | null {
  // The per-brand favicon route (app/icon.tsx) has no file extension, so the proxy
  // matcher runs on it and stamps `x-brand` (which the route needs). It must stay
  // reachable pre-auth — the login page shows the favicon too.
  if (pathname === "/icon") return null;
  const isLogin = pathname === "/login";
  if (!authed && !isLogin) return "/login";
  if (authed && isLogin) return "/inicio";
  return null;
}
