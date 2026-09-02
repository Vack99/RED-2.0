import { headers } from "next/headers";

import { resolveTenant } from "@gym/data/server/resolve-tenant";

import { SenalGym } from "../_components/senal-gym";

/**
 * `clase/[sessionId]`'s half of the freshness rail — the sibling of `reservar/layout.tsx` (see
 * that file for why these are two layouts and not one route group). The class detail page renders
 * a cupo roster of real attendees, which is exactly the number that moves under a member while
 * they read it.
 */
export default async function ClaseLayout({ children }: { children: React.ReactNode }) {
  const tenant = await resolveTenant((await headers()).get("host"), null);

  return (
    <>
      {children}
      {tenant && <SenalGym gymId={tenant.id} />}
    </>
  );
}
