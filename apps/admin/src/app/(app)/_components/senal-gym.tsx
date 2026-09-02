"use client";

import { useRouter } from "next/navigation";

import { useSenalGym } from "@gym/data/client-senal";

/**
 * The signal rail's admin mount (audit 2026-09-01). Renders nothing: it holds ONE private
 * Realtime channel on `gym:<id>` for the whole `(app)` group and answers a signal with
 * `router.refresh()` — a Server Component re-render through the existing `server-only` DAL, so
 * every screen in the group (agenda cupo, door roster, ficha saldo) repaints from the truth
 * rather than from a payload.
 *
 * It lives under `_components/` because `tools/guards/client-seam.test.ts` fails any app
 * `"use client"` file outside `_components/` and its two-entry allow-list.
 *
 * The visibility check is not redundant with the hook's own `visible` motive: a `senal` motive can
 * land while the tab is hidden, and refreshing a hidden tab is a paid RSC round trip nobody is
 * looking at. Coming back to the foreground fires `visible` and freshens it then.
 */
export function SenalGym({ gymId }: { gymId: string }) {
  const router = useRouter();

  useSenalGym({
    gymId,
    onSenal: () => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
    },
  });

  return null;
}
