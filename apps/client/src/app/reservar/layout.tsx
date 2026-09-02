import { headers } from "next/headers";

import { resolveTenant } from "@gym/data/server/resolve-tenant";

import { SenalGym } from "../_components/senal-gym";

/**
 * The member's booking screens get the freshness rail (audit 2026-09-01, weakness 2). A layout
 * rather than the page, so the channel survives the `router.refresh()` it triggers instead of
 * being torn down and rejoined by its own signal.
 *
 * TWO layouts, one here and one at `clase/`, rather than a shared route group: `reservar/` and
 * `clase/` are siblings at the app root, and folding them under `(socio)/` would move
 * `reservar/loading.tsx` and `clase/[sessionId]/loading.tsx`, both pinned BY PATH in
 * `tools/guards/loading-coverage.test.ts`.
 *
 * The gym comes from the same host resolution `page.tsx` already runs (`resolveTenant`), which
 * sits behind a 60s in-process TTL cache — this is not a per-render round trip. An unmapped host
 * (previews, local) resolves null and simply mounts nothing.
 *
 * Safe for a signed-out visitor twice over: this renders around a page that redirects to
 * `/entrar`, and the hook itself checks for a session before opening any socket.
 */
export default async function ReservarLayout({ children }: { children: React.ReactNode }) {
  const tenant = await resolveTenant((await headers()).get("host"), null);

  return (
    <>
      {children}
      {tenant && <SenalGym gymId={tenant.id} />}
    </>
  );
}
