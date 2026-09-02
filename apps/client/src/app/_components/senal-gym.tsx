"use client";

import { useRouter } from "next/navigation";

import { useSenalGym } from "@gym/data/client-senal";

/**
 * The signal rail's member mount (audit 2026-09-01, weakness 2). Renders nothing: it holds ONE
 * private Realtime channel on `gym:<id>` and answers with `router.refresh()`, so the week's cupos
 * and the saldo repaint when a sale, a venta edit, a class cancellation or a pasar-lista changes
 * what this member is looking at. Before this, `router.refresh()` fired only after the member's
 * OWN book or cancel — 19 cross-user write RPCs and zero delivery paths.
 *
 * Refreshing a hidden tab is a paid round trip nobody is looking at; coming back to the
 * foreground fires the hook's `visible` motive and freshens it then.
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
