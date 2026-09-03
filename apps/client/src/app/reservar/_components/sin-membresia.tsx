import Link from "next/link";
import { revalidatePath } from "next/cache";

import { createClient } from "@gym/data/server/supabase";

import { reclamarEnHost } from "../../../lib/reclamo";
import { CerrarSesionLink } from "./cerrar-sesion-link";

/**
 * The graceful "signed-in but not a member yet" state (PRD #64/#66, Cluster C-1,
 * audit #10/#15): a claim that never converged lands here instead of crashing the
 * booking home. Both surfaces re-run the idempotent claim before rendering this, so
 * reaching this screen means the gym in effect holds NO unclaimed row for this
 * verified address — the claim is link-only (R1), so there is nothing else it could
 * have done.
 *
 * That is why the copy now NAMES the address and the gym (design 2026-09-03 §7). "Aún
 * no eres miembro" told a member who had just paid at the desk nothing they could act
 * on; "no encontramos ESTE correo en ESTE gimnasio" is the one sentence that turns the
 * dead end into an errand — the desk holds the fix (a typo'd or missing email on their
 * roster row), and the desk is the only place that can apply it.
 *
 * One cause is a session on the WRONG ACCOUNT, and for that member every link here is a
 * loop: /entrar and /registro bounce a live session back to /reservar. `CerrarSesionLink`
 * is their only way to the login form — see its own note.
 */
export function SinMembresia({
  correo = null,
  gym = null,
}: {
  /** The signed-in caller's VERIFIED address — the identity key the claim matched on (R1). */
  readonly correo?: string | null;
  /** The gym in effect's display name; null on an unmapped host, where no gym is in effect. */
  readonly gym?: string | null;
}) {
  // Re-runs the claim rather than merely re-rendering: the desk may have just fixed the
  // roster row, and this button is the member's way to find out without a logout/login
  // round trip. Idempotent and link-only, so pressing it repeatedly writes nothing.
  async function reintentar() {
    "use server";
    await reclamarEnHost(await createClient());
    revalidatePath("/", "layout");
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-8 text-center">
      <h1 className="text-xl font-extrabold uppercase tracking-wide text-fg">No encontramos tu registro</h1>
      <p className="text-sm leading-relaxed text-muted">
        {correo && gym ? (
          <>
            No encontramos tu correo <strong className="font-semibold text-fg">{correo}</strong> en{" "}
            <strong className="font-semibold text-fg">{gym}</strong>. Pide en recepción que lo
            registren y vuelve a entrar.
          </>
        ) : (
          <>
            Tu cuenta está lista, pero todavía no tienes una membresía activa en este gimnasio. Pide
            en recepción que registren tu correo y vuelve a entrar.
          </>
        )}
      </p>
      <form action={reintentar} className="w-full">
        <button
          type="submit"
          className="mt-2 flex w-full items-center justify-center rounded-xl bg-accent py-4 text-xs font-extrabold uppercase tracking-wider text-accent-fg"
        >
          Volver a intentar
        </button>
      </form>
      <Link
        href="/precios"
        className="text-[11px] font-semibold uppercase tracking-wide text-muted hover:text-fg"
      >
        Ver planes
      </Link>
      <CerrarSesionLink />
    </main>
  );
}
