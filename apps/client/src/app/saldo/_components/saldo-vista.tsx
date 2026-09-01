import type { MembresiaDerivada } from "@gym/data/server/agenda-miembro";

import { CerrarSesionLink } from "../../reservar/_components/cerrar-sesion-link";

/**
 * Saldo — the Lista member's ONE screen behind login (#332): plan, clases restantes (∞ for
 * ilimitado), vence date, and a WhatsApp "renovar" deep link. No booking surface exists on
 * Lista, so this REPLACES /reservar as the login landing entirely — which means it also owns
 * the one thing a member needs from a screen with no drawer/overlay of its own: a way to sign
 * out. `CerrarSesionLink` is reused as-is from /reservar's perfil-overlay escape hatch (same
 * shape, same edge case: a session on the wrong account).
 *
 * Plain server component — no client state of its own beyond the reused island.
 */
export function SaldoVista({
  nombre,
  marca,
  membresia,
  whatsapp,
}: {
  nombre: string;
  marca: string;
  membresia: MembresiaDerivada | null;
  whatsapp: string | null;
}) {
  const primerNombre = nombre.trim().split(/\s+/)[0] ?? "";
  const mensaje = encodeURIComponent(
    marca ? `Hola, quiero renovar mi paquete en ${marca}.` : "Hola, quiero renovar mi paquete.",
  );

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col px-7 pb-14 pt-10">
      <header>
        <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">Mi saldo</span>
        <h1 className="mt-2 text-3xl font-extrabold uppercase leading-none tracking-tight text-fg">
          {primerNombre ? `Hola, ${primerNombre}` : "Tu saldo"}
        </h1>
      </header>

      {membresia ? (
        <section className="mt-8 rounded-2xl border border-line bg-surface p-6">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">Tu plan</div>
          <div className="mt-2 text-2xl font-extrabold tracking-tight text-fg">{membresia.planNombre}</div>

          <div className="mt-5 flex items-baseline justify-between">
            {membresia.vencido ? (
              <span className="text-[13px] text-fg">
                <b className="font-bold text-warning">Plan vencido</b>
              </span>
            ) : membresia.ilimitado ? (
              <span className="text-[13px] text-fg">
                <b className="font-bold text-accent">Ilimitado</b> · sin límite en tu paquete
              </span>
            ) : (
              <span className="text-[13px] text-fg">
                <b className="font-bold text-accent">{membresia.clasesRestLabel}</b> clases restantes
              </span>
            )}
          </div>

          {membresia.renovacionDisplay && (
            <div className="mt-3 text-[11px] text-muted">
              {membresia.vencido ? (
                <>
                  Venció el <b className="font-semibold text-warning">{membresia.renovacionDisplay}</b>
                </>
              ) : (
                <>
                  Renueva el <b className="font-semibold text-accent">{membresia.renovacionDisplay}</b>
                </>
              )}
            </div>
          )}
        </section>
      ) : (
        <section className="mt-8 rounded-2xl border border-dashed border-line px-6 py-9 text-center">
          <p className="text-sm leading-relaxed text-muted">
            Aún no tienes un plan activo{marca ? ` en ${marca}` : ""}. Pregunta en recepción.
          </p>
        </section>
      )}

      {whatsapp && (
        <a
          href={`https://wa.me/${whatsapp}?text=${mensaje}`}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-full bg-accent px-7 py-4 text-sm font-semibold text-accent-fg hover:opacity-90"
        >
          Renovar por WhatsApp
        </a>
      )}

      <div className="mt-10 text-center">
        <CerrarSesionLink />
      </div>
    </main>
  );
}
