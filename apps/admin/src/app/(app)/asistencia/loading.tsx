import { Skeleton } from "@gym/ui/forge/skeleton";
import { Card, Eyebrow, H1 } from "@gym/ui/forge/ui";

/**
 * Route loading fallback mirroring asistencia.tsx — header (static H1 + stat +
 * calendar), day strip, REGISTRADOS progress hero, search row, and pase-list rows.
 */
export default function Loading() {
  return (
    <div>
      {/* Header — static H1 + live stat + calendar button */}
      <div className="flex items-start justify-between" style={{ padding: "14px 22px 4px", gap: 8 }}>
        <div>
          <H1 size={38}>ASISTENCIA</H1>
          <Skeleton width={150} height={12} style={{ marginTop: 8 }} />
        </div>
        <Skeleton width={38} height={38} />
      </div>

      {/* Day strip — recent-day cells */}
      <div className="flex" style={{ gap: 6, padding: "10px 16px 2px" }}>
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <Skeleton key={i} width={46} height={52} />
        ))}
      </div>

      {/* Progress hero */}
      <Card style={{ margin: "8px 16px 0" }}>
        <div className="flex items-center justify-between">
          <Eyebrow>REGISTRADOS</Eyebrow>
          <Skeleton width={36} height={12} />
        </div>
        <div className="flex items-baseline" style={{ gap: 6, marginTop: 6 }}>
          <Skeleton width={60} height={40} />
          <Skeleton width={44} height={24} />
        </div>
        <Skeleton height={3} style={{ marginTop: 14 }} />
      </Card>

      {/* Search + add */}
      <div className="flex items-stretch" style={{ padding: "16px 16px 4px", gap: 8 }}>
        <Skeleton height={48} style={{ flex: 1 }} />
        <Skeleton width={50} height={48} />
      </div>

      {/* Pase list — ~3 rows */}
      <div style={{ paddingTop: 8 }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex items-center"
            style={{
              gap: 14,
              padding: "12px 22px",
              borderTop: i === 0 ? "1px solid var(--line)" : "none",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <Skeleton width={40} height={40} />
            <div className="min-w-0 flex-1">
              <Skeleton width="50%" height={14} />
              <Skeleton width={140} height={11} style={{ marginTop: 5 }} />
            </div>
            <Skeleton width={28} height={28} />
          </div>
        ))}
      </div>

      <div style={{ height: 24 }} />
    </div>
  );
}
