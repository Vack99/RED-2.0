import { Skeleton } from "@gym/ui/forge/skeleton";

// Route loading fallback mirroring clase-detalle.tsx — the status hero, Datos rows,
// and cupo roster — at matching paddings so the swap is not a layout jump; the
// data-conditional sections (coaches, la sesión, qué trabajamos/traer) are omitted.
export default function Loading() {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-canvas">
      {/* Header — static back link; the contexto tag is data */}
      <header className="flex flex-none items-center justify-between px-5 pb-2 pt-4">
        <div className="flex items-center gap-2 text-muted">
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M12 4l-6 6 6 6" />
          </svg>
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em]">Horario</span>
        </div>
        <Skeleton width={72} height={11} />
      </header>

      <div className="flex-1 overflow-y-auto">
        {/* Hero */}
        <section className="border-b border-line px-6 pb-6 pt-3">
          <div className="flex items-start justify-between gap-3">
            <Skeleton width={64} height={22} radius={999} />
            <Skeleton width={72} height={22} radius={999} />
          </div>
          <Skeleton width="70%" height={34} style={{ marginTop: 16 }} />
          <Skeleton width="45%" height={11} style={{ marginTop: 12 }} />
          <Skeleton width="55%" height={12} style={{ marginTop: 6 }} />
          <Skeleton width={120} height={12} style={{ marginTop: 16 }} />
        </section>

        {/* Datos — fixed 5 rows; the labels are static copy, the values are data */}
        <section className="px-6 py-4">
          <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Datos</div>
          {["Hora", "Duración", "Sala", "Nivel", "Cupo"].map((k) => (
            <div key={k} className="flex items-center justify-between border-b border-line py-2.5 last:border-0">
              <span className="text-[11px] uppercase tracking-wide text-muted">{k}</span>
              <Skeleton width={90} height={13} />
            </div>
          ))}
        </section>

        {/* Cupo roster */}
        <div className="border-t border-line">
          <section className="px-6 py-4">
            <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Cupo</div>
            {/* pips row — one placeholder bar at the 6px pip height */}
            <Skeleton height={6} radius={1} style={{ marginBottom: 12 }} />
            <Skeleton width={180} height={11} />
            <div className="mt-3.5 flex gap-1.5">
              {[0, 1, 2, 3].map((i) => (
                <Skeleton key={i} circle width={30} />
              ))}
            </div>
          </section>
        </div>
      </div>

      {/* CTA footer — helper line + full-width action button */}
      <div className="flex-none border-t border-line bg-canvas px-6 pb-8 pt-4">
        <Skeleton width="60%" height={11} className="mx-auto" style={{ marginBottom: 10 }} />
        <Skeleton height={52} radius={12} />
      </div>
    </main>
  );
}
