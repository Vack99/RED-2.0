import type { ReactNode } from "react";
import Link from "next/link";

/**
 * The member-app "route to /precios" CTA — a muted reason line + the "Ver planes" link.
 * The single home for the paga-en-tu-gym affordance a member sees when they CAN'T book: no
 * classes left, or a lapsed vigencia (#118). Both booking surfaces (the summary sheet and the
 * class-detail CTA) render this instead of an enabled book button that would only dead-end in
 * the reservar_clase RPC. `children` is the surface-specific reason copy (es-MX).
 */
export function CtaVerPlanes({ children }: { children: ReactNode }) {
  return (
    <>
      <p className="mb-2.5 text-center text-[11px] text-muted">{children}</p>
      <Link
        href="/precios"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-4 text-xs font-extrabold uppercase tracking-wider text-accent-fg"
      >
        Ver planes
        <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 10h10M11 6l4 4-4 4" />
        </svg>
      </Link>
    </>
  );
}
