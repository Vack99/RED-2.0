import { Skeleton } from "@gym/ui/forge/skeleton";
import { AppBar, H1 } from "@gym/ui/forge/ui";

/**
 * Route loading fallback mirroring clientes.tsx (the roster) — DIRECTORIO AppBar,
 * title + counts, search/filter row, count·orden bar, and the roster rows.
 */
export default function Loading() {
  return (
    <div>
      <AppBar center="DIRECTORIO" trailing={<Skeleton width={38} height={38} />} />

      {/* Title + counts */}
      <div style={{ padding: "14px 22px 4px" }}>
        <H1 size={38}>CLIENTES</H1>
        <Skeleton width={200} height={12} style={{ marginTop: 8 }} />
      </div>

      {/* Search + funnel */}
      <div className="flex" style={{ padding: "14px 16px 0", gap: 8 }}>
        <Skeleton height={48} style={{ flex: 1 }} />
        <Skeleton width={52} height={48} />
      </div>

      {/* Count · orden — static ORDEN + sort labels, Días active by default */}
      <div className="flex items-center justify-between" style={{ padding: "14px 22px 6px" }}>
        <Skeleton width={70} height={10} />
        <div className="flex items-center">
          <span style={{ fontSize: 10, color: "var(--muted)", letterSpacing: 1, marginRight: 8 }}>ORDEN</span>
          {(["Días", "A→Z", "Asist."] as const).map((l, i) => (
            <span
              key={l}
              className="font-bold"
              style={{ padding: "10px 8px", color: i === 0 ? "var(--yellow)" : "var(--muted)", fontSize: 11, letterSpacing: 0.4, marginLeft: i === 0 ? 0 : 8 }}
            >
              <span style={{ borderBottom: "1.5px solid", borderColor: i === 0 ? "var(--yellow)" : "transparent", paddingBottom: 2 }}>{l}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Roster rows — ~3 */}
      <div style={{ paddingBottom: 12 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-center" style={{ gap: 14, borderBottom: "1px solid var(--line)" }}>
            <div className="flex min-w-0 flex-1 items-center" style={{ gap: 14, padding: "14px 0 14px 22px" }}>
              <Skeleton width={42} height={42} />
              <div className="min-w-0 flex-1">
                <Skeleton width="48%" height={14} />
                <Skeleton width={160} height={11} style={{ marginTop: 5 }} />
              </div>
            </div>
            <div className="shrink-0" style={{ textAlign: "right", minWidth: 56, padding: "14px 22px 14px 0" }}>
              <Skeleton width={40} height={17} style={{ marginLeft: "auto" }} />
              <Skeleton width={28} height={10} style={{ marginTop: 5, marginLeft: "auto" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
