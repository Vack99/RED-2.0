"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

import { createClient } from "@gym/data/client";

/**
 * The escape hatch out of `SinMembresia` — the ONLY one that cohort has.
 *
 * A session whose account has no membership in THIS gym (a self-registration under the
 * wrong email, a reset-first session on an unclaimed account) lands on SinMembresia, and
 * every other door now leads back to it: /entrar and /registro bounce a live session to
 * /reservar, and the drawer's booking CTAs follow suit. The other two `signOut()` sites are
 * unreachable from here — the perfil overlay needs a membership, the vincular form needs an
 * invite link — so without this button the member cannot reach the login form to sign in
 * with the right account. Same call shape the perfil overlay uses (`@gym/data/client`, then
 * a router push): once the session is gone, /entrar's gate renders the form again.
 */
export function CerrarSesionLink() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function cerrarSesion() {
    setPending(true);
    setError(null);
    const { error: signOutError } = await createClient().auth.signOut();
    if (signOutError) {
      setError("No se pudo cerrar sesión. Inténtalo de nuevo.");
      setPending(false);
      return;
    }
    router.push("/entrar");
    router.refresh();
  }

  return (
    <>
      <button
        type="button"
        onClick={cerrarSesion}
        disabled={pending}
        className="text-[11px] font-semibold uppercase tracking-wide text-muted hover:text-fg disabled:opacity-40"
      >
        {pending ? "Cerrando sesión…" : "¿Esta no es tu cuenta? Cierra sesión"}
      </button>
      {error && (
        <p role="alert" className="text-[11px]" style={{ color: "var(--red)" }}>
          {error}
        </p>
      )}
    </>
  );
}
