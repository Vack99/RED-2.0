import { Skeleton } from "@gym/ui/forge/skeleton";

// Route loading fallback for the comercial landing ((home)/page.tsx) — mirrors the
// hero lockup, pricing teaser, today-schedule rows and footer at matching paddings.
export default function Loading() {
  return (
    <main className="mx-auto flex w-full max-w-md flex-col pb-14">
      <section className="cm-hero flex flex-col items-center px-7 pt-14 text-center">
        {/* Brand logo lockup (size 200) */}
        <Skeleton width={200} height={80} radius={12} />

        {/* Static eyebrow row — copy the real page hardcodes */}
        <div className="cm-sub mt-6 flex w-full items-center justify-center gap-3.5">
          <div className="ln h-px max-w-[46px] flex-1 bg-line" aria-hidden />
          <span className="text-xs font-medium uppercase tracking-[0.2em] text-muted">
            Entrenamiento funcional
          </span>
          <div className="ln h-px max-w-[46px] flex-1 bg-line" aria-hidden />
        </div>

        {/* Tagline (brand-driven) */}
        <Skeleton width={180} height={14} radius={4} style={{ marginTop: 18 }} />

        {/* Static CTA the real page hardcodes */}
        <div className="btn-primary mt-10 inline-flex items-center gap-2 rounded-full bg-accent px-7 py-3.5 text-sm font-semibold text-accent-fg">
          Reservar clase
          <span aria-hidden>→</span>
        </div>
      </section>

      {/* Pricing teaser — the collapsed "Ver precios" affordance */}
      <section className="mx-auto mt-5 w-full max-w-md px-7">
        <div className="flex w-full items-center justify-center gap-2 py-2 text-sm font-semibold text-muted">
          <span>Ver precios</span>
          <span aria-hidden className="text-xs leading-none">
            ▾
          </span>
        </div>
      </section>

      <section className="cm-sched mt-12 px-7">
        {/* "Hoy en {brandName}" — static prefix + data brand name */}
        <h2 className="h flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">
          Hoy en
          <Skeleton width={64} height={9} radius={3} />
        </h2>
        <div className="mt-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-baseline justify-between border-t border-line py-3.5 last:border-b"
            >
              <span className="flex items-baseline gap-[18px]">
                <Skeleton width={40} height={13} radius={3} />
                <Skeleton width={120} height={15} radius={3} />
              </span>
              <Skeleton width={56} height={11} radius={3} />
            </div>
          ))}
        </div>
      </section>

      <footer className="cm-foot mt-14 px-7 text-center">
        {/* "{brandName} — estudio funcional" (data prefix) */}
        <Skeleton width={200} height={15} radius={3} style={{ margin: "0 auto" }} />
        {/* Static descriptor the real page hardcodes */}
        <p className="mt-1.5 text-[11px] text-muted">Lun a Sáb · desde las 05:30</p>
        <div className="mt-5 flex items-center justify-center gap-4">
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            Nosotros
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            Precios
          </span>
          <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted">
            Contacto
          </span>
        </div>
      </footer>
    </main>
  );
}
