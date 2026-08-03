import { LogoutButton } from "./logout-button";

/**
 * The 2+-staff-membership no-redirect-target screen (#208, epic #203).
 *
 * The owner's ruling for a host↔membership mismatch is auto-redirect to the correct host.
 * That answers the single-gym case and only the single-gym case. With two or more staff
 * memberships and a host that names none of them there is no single correct target, so a
 * redirect would be a guess — and ADR-0008's 2026-08-02 amendment says the app "resolves it
 * explicitly rather than guessing."
 *
 * Live population is **0 multi-gym staff**, so this is dead code today. It still needs a
 * DEFINED behaviour rather than an accidental one: the accidental one was `getOperatorGym`
 * silently picking the lowest `gym_id` and rendering that gym under another gym's chrome,
 * which is the reported defect wearing a different hat.
 *
 * Every host here is derived server-side from `gym_domain where app = 'admin'` — never from
 * a param, header, or cookie. A gym with no admin host maps to no link rather than a broken
 * one; it is still named, so the operator can see it exists.
 *
 * The sign-out is not decoration. This repo already shipped one dead-end lockout screen that
 * needed a follow-up fix (`SinGimnasio`, fixed at c502872): the layout swaps `children` for
 * this component on every `(app)` route, so /cuenta — the only other place `LogoutButton`
 * renders — is unreachable, and `decideRedirect` bounces an authed session off /login. Without
 * a sign-out here the only exit is clearing the cookie by hand.
 */
export interface GimnasioDelOperador {
  slug: string;
  /** `gym.brand_name`, mixed-case as stored — the operator recognises the brand, not the slug. */
  nombre: string;
  /** Its own admin hostname from `gym_domain`, or `null` when that gym has no admin host mapped. */
  host: string | null;
}

export function VariosGimnasios({ gimnasios }: { gimnasios: readonly GimnasioDelOperador[] }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <h1 className="text-lg font-bold uppercase tracking-wide text-fg">Elige tu gimnasio</h1>
      <p className="text-sm leading-relaxed text-muted">
        Esta dirección no corresponde a ninguno de tus gimnasios. Entra por la de uno de ellos:
      </p>
      <ul className="mt-2 flex w-full max-w-xs flex-col gap-2">
        {gimnasios.map((g) => (
          <li key={g.slug}>
            {g.host ? (
              <a
                href={`https://${g.host}/inicio`}
                className="block rounded-lg border border-line px-4 py-3 text-sm font-semibold uppercase tracking-wide text-fg"
              >
                {g.nombre}
              </a>
            ) : (
              <span className="block rounded-lg border border-line px-4 py-3 text-sm text-muted">
                {g.nombre} — sin dirección asignada
              </span>
            )}
          </li>
        ))}
      </ul>
      <div className="mt-3">
        <LogoutButton />
      </div>
    </div>
  );
}
