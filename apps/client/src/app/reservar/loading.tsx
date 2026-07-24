import type { CSSProperties } from "react";

import { Skeleton } from "@gym/ui/forge/skeleton";

// Route loading fallback mirroring reservar-semana.tsx — the "Esta semana"
// header, the weekday picker, and the ticket list — at matching paddings so the
// swap to real content is not a layout jump. Starts below the layout's PublicHeader.
export default function Loading() {
  return (
    <main className="mx-auto w-full max-w-md px-4 pb-10">
      {/* Header — static eyebrow + title; avatar initials are data */}
      <header className="flex items-start justify-between px-2 pt-6">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">Reservar clase</div>
          <h1 className="mt-2 text-3xl font-extrabold uppercase leading-none tracking-tight text-fg">
            Esta semana
          </h1>
        </div>
        <Skeleton circle width={40} />
      </header>

      {/* Day picker — the Lun–Sáb week (fixed 6 columns, flex-1 like the real row) */}
      <div className="mt-5 flex gap-1 px-1">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="flex flex-1 flex-col items-center gap-2 py-1">
            <Skeleton width={18} height={9} />
            <Skeleton width={20} height={22} />
            {/* active-indicator underline slot — transparent to hold the height */}
            <span className="h-[3px] w-4" />
          </div>
        ))}
      </div>

      <div className="mx-2 mt-3 h-px bg-line" />

      {/* Class list — 3 placeholder ticket cards */}
      <section className="mt-4 flex flex-col gap-3 px-1">
        {[0, 1, 2].map((i) => (
          <div key={i} className="ticket w-full" style={{ "--notch-x": "calc(100% - 104px)", border: "none" } as CSSProperties}>
            <div className="flex min-w-0 flex-1 flex-col p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <Skeleton width="55%" height={18} />
                  <Skeleton width="72%" height={11} style={{ marginTop: 8 }} />
                </div>
                <Skeleton width={26} height={26} />
              </div>
              {/* ember occupancy bar track (empty = unfilled), same height/margin */}
              <div className="rcard-pips" />
            </div>

            <span className="ticket-perf" />
            <span className="ticket-notch top" />
            <span className="ticket-notch bottom" />

            <div className="flex w-[104px] flex-none flex-col items-center justify-center gap-3 bg-sunk px-2.5 py-4">
              <Skeleton width={44} height={18} />
              <Skeleton width={62} height={28} />
            </div>
          </div>
        ))}
      </section>

      {/* Footer — static copy */}
      <footer className="mt-6 px-2 text-center">
        <p className="text-[11px] text-muted">Cancela sin costo hasta 2 h antes de la clase.</p>
      </footer>
    </main>
  );
}
