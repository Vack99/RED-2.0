"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { forgeToast } from "@/components/forge/toaster";
import { createClient } from "@/lib/supabase/client";

/**
 * Quiet sign-out utility, mirroring the client-side login pattern
 * (login-form.tsx): the browser Supabase client clears the session cookie, then
 * we navigate to /login. The proxy's auth gate (decideRedirect) keeps an
 * unauthenticated visitor on /login, so this lands the operator on the sign-in
 * screen — symmetric with how sign-in lands them on /inicio.
 *
 * Deliberately low-emphasis: a muted utility link, not a gold CTA. Hover/focus
 * lifts the color toward --fg; a real :focus-visible ring (which inline styles
 * cannot express) is supplied via a token-only scoped <style> so it stays
 * correct in both light and dark themes.
 */
export function LogoutButton() {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  async function onClick() {
    if (pending) return; // guard double-clicks
    setPending(true);

    const supabase = createClient();
    const { error } = await supabase.auth.signOut();

    if (error) {
      forgeToast({
        tone: "warning",
        title: "No se pudo cerrar sesión",
        body: "Inténtalo de nuevo en un momento.",
      });
      setPending(false);
      return;
    }

    router.replace("/login");
    router.refresh();
  }

  return (
    <>
      <style>{`
        .forge-logout {
          color: var(--muted);
          transition: color 160ms ease;
        }
        .forge-logout:hover:not(:disabled),
        .forge-logout:focus-visible {
          color: var(--fg);
        }
        .forge-logout:focus-visible {
          outline: 2px solid var(--gold);
          outline-offset: 3px;
        }
        .forge-logout:disabled {
          cursor: default;
          opacity: 0.6;
        }
      `}</style>
      <button
        type="button"
        onClick={onClick}
        disabled={pending}
        className="forge-logout uppercase"
        style={{
          background: "transparent",
          border: "none",
          padding: "6px 10px",
          fontSize: 10.5,
          fontWeight: 700,
          letterSpacing: 1.6,
          cursor: "pointer",
          minWidth: 160,
          whiteSpace: "nowrap",
        }}
      >
        {pending ? "Cerrando sesión…" : "Cerrar sesión"}
      </button>
    </>
  );
}
