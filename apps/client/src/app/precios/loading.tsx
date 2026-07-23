import { Skeleton } from "@gym/ui/forge/skeleton";

// Route loading fallback for /precios — mirrors the centered header, the 3-up plan
// grid, the "incluye" list, the FAQ and the always-present closer at matching paddings.
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-5xl px-5 py-10">
      <header className="mx-auto max-w-2xl text-center">
        {/* "Precios · {gym.brandName}" eyebrow (data-gated) */}
        <Skeleton width={150} height={12} radius={3} style={{ margin: "0 auto" }} />
        {/* Static heading + intro the real page hardcodes */}
        <h1 className="mt-3 text-4xl font-extrabold tracking-tight text-fg">Planes</h1>
        <p className="mt-3 text-base text-muted">
          Elige cómo entrenas. Sin permanencia, sin letras chiquitas. Cancelas cuando quieras.
        </p>
        {/* Tagline (data) */}
        <Skeleton width={220} height={14} radius={4} style={{ margin: "16px auto 0" }} />
      </header>

      {/* Plans grid — 3 plan cards */}
      <section className="mt-10 grid gap-5 md:grid-cols-3 md:items-start">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="relative flex flex-col rounded-3xl border border-line bg-surface p-6"
          >
            <Skeleton width={72} height={20} radius={999} style={{ marginBottom: 12 }} />
            <Skeleton width={120} height={22} radius={3} />
            <Skeleton width={160} height={12} radius={3} style={{ marginTop: 6 }} />
            <Skeleton width={110} height={32} radius={4} style={{ marginTop: 16 }} />
            <div className="mt-5 flex flex-1 flex-col gap-3">
              {[0, 1, 2].map((r) => (
                <div key={r} className="flex items-baseline gap-2">
                  <Skeleton circle width={12} />
                  <Skeleton width="80%" height={13} radius={3} />
                </div>
              ))}
            </div>
            <Skeleton height={44} radius={999} style={{ marginTop: 24 }} />
          </div>
        ))}
      </section>

      {/* Todos los planes incluyen — always-present, mixed static + data rows */}
      <section className="mx-auto mt-12 max-w-2xl rounded-3xl border border-line bg-surface p-6">
        <span className="font-mono text-xs font-semibold uppercase tracking-widest text-muted">
          Todos los planes incluyen
        </span>
        <dl className="mt-4 flex flex-col divide-y divide-line">
          {/* Data rows: coaches count + horario (value is data) */}
          {["Coaches certificados", "Horario"].map((k) => (
            <div key={k} className="flex items-center justify-between py-3">
              <dt className="text-sm text-fg">{k}</dt>
              <Skeleton width={90} height={13} radius={3} />
            </div>
          ))}
          {/* Static rows the real page always hardcodes */}
          {[
            { k: "Equipo y material", v: "Sin costo extra" },
            { k: "Reserva digital", v: "Desde la app" },
            { k: "Permanencia", v: "Ninguna" },
          ].map((row) => (
            <div key={row.k} className="flex items-center justify-between py-3">
              <dt className="text-sm text-fg">{row.k}</dt>
              <dd className="text-sm font-medium tabular-nums text-muted">{row.v}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Preguntas frecuentes — 3 accordion rows */}
      <section className="mx-auto mt-12 max-w-2xl">
        <span className="font-mono text-xs font-semibold uppercase tracking-widest text-muted">
          Preguntas frecuentes
        </span>
        <div className="mt-4 flex flex-col gap-2">
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              className="flex items-center justify-between gap-3 overflow-hidden rounded-2xl border border-line bg-surface px-4 py-4"
            >
              <Skeleton width="70%" height={14} radius={3} />
              <span aria-hidden className="shrink-0 text-lg leading-none text-accent">
                +
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* Empieza hoy — always-present static closer */}
      <section className="mx-auto mt-12 max-w-2xl rounded-3xl border border-line bg-sunk p-8 text-center">
        <h3 className="text-2xl font-bold text-fg">Empieza hoy</h3>
        <p className="mx-auto mt-2 max-w-md text-sm text-muted">
          Reserva tu lugar y entrena desde el primer día. Sin permanencia, cancelas cuando quieras.
        </p>
        <div className="mt-5 flex flex-col items-center gap-3">
          <span className="inline-flex justify-center rounded-full bg-accent px-6 py-3 text-sm font-semibold text-accent-fg">
            Empezar ahora
          </span>
          <span className="inline-flex justify-center rounded-full border border-line px-6 py-3 text-sm font-semibold text-fg">
            Ver horarios
          </span>
        </div>
        <p className="mt-5 text-xs text-muted">
          Sin permanencia · Cancela cuando quieras
          <br />
          Precios en pesos MXN · IVA incluido
        </p>
      </section>
    </main>
  );
}
