"use client";

import { Toaster as SonnerToaster } from "sonner";

/**
 * Brand-neutral toast queue host — mounted once in a root layout (grill lock (j)).
 * It is only the sonner queue/positioning host and carries no brand copy; the
 * token-driven toast CARDS (and the `forgeToast` fire helper) stay under the
 * product `@gym/ui/forge/toaster` namespace. Cards recolor per brand through the
 * CSS-var contract, so one neutral host serves every marca.
 */
export function Toaster() {
  return (
    <SonnerToaster
      position="top-center"
      offset={16}
      mobileOffset={16}
      gap={8}
      toastOptions={{ unstyled: true, style: { width: "100%" } }}
      style={{ width: "min(410px, calc(100vw - 32px))" }}
    />
  );
}
