import { Skeleton } from "@gym/ui/forge/skeleton";

// Route loading fallback for /nosotros — mirrors the hero, the story, the
// stats/values/coaches sections and the always-present closing CTA at the real paddings.
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-3xl px-5 py-10">
      <section className="max-w-2xl">
        {/* "Nosotros · {gym.brandName}" eyebrow (data-gated) */}
        <Skeleton width={150} height={12} radius={3} />
        {/* Static heading + intro the real page hardcodes */}
        <h1 className="mt-3 text-4xl font-extrabold uppercase tracking-tight text-fg">
          Quiénes somos
        </h1>
        <p className="mt-3 text-base leading-relaxed text-muted">
          Conoce al equipo, los valores y el espacio donde vas a entrenar.
        </p>
        {/* Tagline (data) */}
        <Skeleton width={220} height={14} radius={4} style={{ marginTop: 16 }} />
        {/* Static CTAs the real page hardcodes */}
        <div className="mt-6 flex flex-wrap gap-3">
          <span className="inline-flex justify-center rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-fg">
            Empezar ahora
          </span>
          <span className="inline-flex justify-center rounded-full border border-line px-6 py-3 text-sm font-semibold text-fg">
            Ver planes
          </span>
        </div>
      </section>

      {/* Nuestra historia — likely-present for the primary gym (about_story is seeded) */}
      <section className="mt-12">
        <span className="text-xs font-semibold uppercase tracking-widest text-accent">
          Nuestra historia
        </span>
        <div className="mt-4 flex flex-col gap-4">
          <Skeleton width="100%" height={12} radius={3} />
          <Skeleton width="95%" height={12} radius={3} />
          <Skeleton width="60%" height={12} radius={3} />
        </div>
      </section>

      {/* En números — 3 stat tiles */}
      <section className="mt-12">
        <span className="text-xs font-semibold uppercase tracking-widest text-accent">
          En números
        </span>
        <dl className="mt-4 grid grid-cols-3 gap-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="rounded-2xl border border-line bg-surface p-4 text-center">
              <Skeleton width={48} height={28} radius={4} style={{ margin: "0 auto" }} />
              <Skeleton width={64} height={11} radius={3} style={{ margin: "6px auto 0" }} />
            </div>
          ))}
        </dl>
      </section>

      {/* Nuestros valores — 3 numbered rows */}
      <section className="mt-12">
        <span className="text-xs font-semibold uppercase tracking-widest text-accent">
          Lo que nos mueve
        </span>
        <h2 className="mt-2 text-2xl font-bold text-fg">Nuestros valores</h2>
        <div className="mt-5 flex flex-col gap-5">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex gap-4">
              <Skeleton width={20} height={14} radius={3} />
              <div className="flex-1">
                <Skeleton width={140} height={16} radius={3} />
                <Skeleton width="90%" height={12} radius={3} style={{ marginTop: 8 }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Coaches — 3 roster cards */}
      <section className="mt-12">
        <span className="text-xs font-semibold uppercase tracking-widest text-accent">
          El equipo
        </span>
        <h2 className="mt-2 text-2xl font-bold text-fg">Coaches</h2>
        <div className="mt-4">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex gap-4 border-t border-line py-4 first:border-t-0"
            >
              <Skeleton circle width={48} />
              <div className="min-w-0 flex-1">
                <Skeleton width={120} height={16} radius={3} />
                <Skeleton width={90} height={11} radius={3} style={{ marginTop: 6 }} />
                <Skeleton width="85%" height={12} radius={3} style={{ marginTop: 10 }} />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Empieza hoy — always-present static closer */}
      <section className="mx-auto mt-14 max-w-2xl rounded-3xl border border-line bg-sunk p-8 text-center">
        <h3 className="text-2xl font-bold text-fg">Empieza hoy</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Tu primera clase no requiere permanencia. Crea tu cuenta y reserva desde el primer día.
        </p>
        <span className="mt-5 inline-flex justify-center rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-fg">
          Empezar ahora
        </span>
        <Skeleton width={200} height={12} radius={3} style={{ margin: "20px auto 0" }} />
      </section>
    </main>
  );
}
