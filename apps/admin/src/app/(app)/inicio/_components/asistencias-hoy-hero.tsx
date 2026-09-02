"use client";

import * as React from "react";

import { CountUp } from "@gym/ui/forge/count-up";
import { Card, Eyebrow } from "@gym/ui/forge/ui";

const SPARK_FLOOR = 0.06;

/**
 * The ASISTENCIAS · HOY hero — #328 dropped it, owner ruling 2026-09-01 restored it
 * on the Lista arm ONLY (`inicio.tsx`), reusing the pre-#328 markup/styles verbatim
 * (`git show 27d8fff^:apps/admin/src/app/(app)/inicio/_components/inicio.tsx`) over
 * main's current skin, backed by the new count-shaped `getAsistenciasResumenHoy`
 * (`@gym/data/server/asistencia`) instead of the deleted full-row `getAsistenciasHoy`.
 *
 * A dedicated "use client" leaf, not folded into `InicioScreen`: that screen is a
 * plain server component by design (#328 — every clock/tz read happens in page.tsx so
 * SSR and hydration render identically), and only the sparkline's mount-grow animation
 * and `CountUp`'s tween need client state — the same reason `CountUp` itself is its
 * own extracted client leaf.
 */
export function AsistenciasHoyHero({
  hoy,
  ayer,
  semana,
}: {
  hoy: number;
  ayer: number;
  /** 7-day daily series, oldest→newest, ending TODAY. */
  semana: number[];
}) {
  const deltaAyer = hoy - ayer;
  const deltaLabel = deltaAyer === 0 ? "IGUAL QUE AYER" : `${deltaAyer > 0 ? "+" : ""}${deltaAyer} vs AYER`;
  const deltaColor = deltaAyer < 0 ? "var(--gold)" : "var(--green)";

  const maxSpark = Math.max(1, ...semana);

  // Sparkline bars start at the floor and grow to their real height on mount (the CSS
  // scaleY transition needs a from-state). The flip is deferred a frame via rAF so the
  // floor paints first; under reduced motion the global CSS block neutralizes the
  // transition, so the bars simply appear at height.
  const [sparkGrown, setSparkGrown] = React.useState(false);
  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setSparkGrown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <Card glow style={{ marginTop: 16 }}>
      <div className="flex items-start justify-between">
        <Eyebrow>ASISTENCIAS · HOY</Eyebrow>
        <span style={{ fontSize: 10.5, color: deltaColor, letterSpacing: 0.6, fontWeight: 700 }}>
          {deltaLabel}
        </span>
      </div>
      <div className="flex items-end" style={{ gap: 10, marginTop: 8 }}>
        <CountUp
          value={hoy}
          className="font-extrabold"
          style={{ fontSize: 76, lineHeight: 0.85, letterSpacing: -2.5, color: "var(--fg)" }}
        />
        <span style={{ fontSize: 13, color: "var(--muted)", paddingBottom: 10 }}>de pase registrado</span>
      </div>
      {/* sparkline — real last-7-days series, oldest→newest ending today */}
      <div className="flex items-end" style={{ gap: 4, marginTop: 16, height: 30 }}>
        {semana.map((v, i) => (
          // GPU-composited: scaleY from the bottom (transform, not animated height) so
          // the bars grow identically without triggering layout. Seeded at the floor for
          // one frame, then flipped to the real scale so the CSS transition animates the
          // growth in.
          <div
            key={i}
            className="flex-1"
            style={{
              height: "100%",
              transform: `scaleY(${sparkGrown ? Math.max(SPARK_FLOOR, v / maxSpark) : SPARK_FLOOR})`,
              transformOrigin: "bottom",
              transition: "transform 300ms cubic-bezier(.32,.72,0,1)",
              background: i === semana.length - 1 ? "var(--yellow)" : "var(--muted-soft)",
            }}
          />
        ))}
      </div>
      <div className="flex justify-between" style={{ marginTop: 8, fontSize: 10, color: "var(--muted)", letterSpacing: 1 }}>
        <span>7 DÍAS ATRÁS</span>
        <span>HOY</span>
      </div>
    </Card>
  );
}
