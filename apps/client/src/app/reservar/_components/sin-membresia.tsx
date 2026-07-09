import Link from "next/link";

/**
 * The graceful "signed-in but not a member yet" state (PRD #64/#66, Cluster C-1,
 * audit #10/#15): a claim that never converged — a swallowed sale-side failure or
 * a password-reset-first session — lands here instead of crashing the booking
 * home. `/reservar` re-runs the idempotent claim once before rendering this, so
 * reaching this screen means the caller genuinely has no `clientes` row to claim
 * yet (e.g. no matching invite/sale on this gym).
 */
export function SinMembresia() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col items-center justify-center gap-4 px-8 text-center">
      <h1 className="text-xl font-extrabold uppercase tracking-wide text-fg">Aún no eres miembro</h1>
      <p className="text-sm leading-relaxed text-muted">
        Tu cuenta está lista, pero todavía no tienes una membresía activa en este gimnasio. Visita
        el gimnasio para activar tu paquete y empezar a reservar clases.
      </p>
      <Link
        href="/precios"
        className="mt-2 flex w-full items-center justify-center rounded-xl bg-accent py-4 text-xs font-extrabold uppercase tracking-wider text-white"
      >
        Ver planes
      </Link>
      <Link
        href="/"
        className="text-[11px] font-semibold uppercase tracking-wide text-muted hover:text-fg"
      >
        Volver al inicio
      </Link>
    </main>
  );
}
