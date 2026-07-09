/**
 * The admin shell's graceful "no staff access" state (PRD #64/#66, Cluster C-4,
 * audit #19): a signed-in account whose ONLY `gym_membership` row is `member`
 * (a socio who self-registered or claimed an invite, never staff) reaches the
 * admin app and gets this instead of the empty operator shell — `getOperatorGym`
 * now requires a staff role, so every `(app)` page throws for that session; the
 * layout catches it once here. No new abstraction beyond this single small
 * component; RLS is untouched, this is presentation only.
 */
export function SinGimnasio() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 px-8 text-center">
      <h1 className="text-lg font-bold uppercase tracking-wide text-fg">Sin gimnasio</h1>
      <p className="text-sm leading-relaxed text-muted">
        Esta cuenta no tiene acceso de personal a ningún gimnasio. Si eres socio, usa la app de
        reservas de tu gimnasio para agendar tus clases.
      </p>
    </div>
  );
}
