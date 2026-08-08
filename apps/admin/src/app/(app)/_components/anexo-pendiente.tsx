import { LogoutButton } from "./logout-button";

/**
 * The Gate 0.1 click-wrap gate's OPERATOR view (#254, binding decision): acceptance is
 * OWNER-only, so an operator (staff, not owner) of a gym whose current Anexo version is
 * unaccepted is blocked here instead of the accept form — no bypass, no accept button. Matches
 * `SinGimnasio`'s shape and copy tone: the layout swaps `children` for this on every `(app)`
 * route, so /cuenta (the only other `LogoutButton` call site) is unreachable until the owner
 * accepts; sign-out is the only exit.
 */
export function AnexoPendiente() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <h1 className="text-lg font-bold uppercase tracking-wide text-fg">Anexo pendiente</h1>
      <p className="text-sm leading-relaxed text-muted">
        Tu gimnasio necesita aceptar el Anexo de Tratamiento de Datos Personales antes de
        continuar. Solo el dueño de la cuenta puede aceptarlo — pídele que inicie sesión y lo
        acepte.
      </p>
      <div className="mt-3">
        <LogoutButton />
      </div>
    </div>
  );
}
