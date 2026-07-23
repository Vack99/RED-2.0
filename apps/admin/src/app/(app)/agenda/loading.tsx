import { Skeleton } from "@gym/ui/forge/skeleton";

/**
 * Route loading fallback mirroring agenda.tsx — the sticky header (title, navigator,
 * date strip, DÍA/SEMANA toggle) and the default DÍA day-header + session cards.
 */
export default function Loading() {
  return (
    <div>
      {/* Header */}
      <div style={{ background: "var(--canvas)", borderBottom: "1px solid var(--line)" }}>
        <div className="flex items-center justify-between" style={{ padding: "16px 18px 10px" }}>
          <span className="uppercase" style={{ fontSize: 21, fontWeight: 800, letterSpacing: -0.5, color: "var(--fg)" }}>
            Agenda<span style={{ color: "var(--yellow)" }}>.</span>
          </span>
          <Skeleton width={40} height={40} />
        </div>

        {/* Navigator — context + relative labels (both data) */}
        <div className="flex items-baseline" style={{ gap: 10, padding: "0 22px 2px" }}>
          <Skeleton width={92} height={12} />
          <Skeleton width={40} height={9} />
        </div>

        {/* Date strip — 6 day columns flanked by arrow gutters */}
        <div className="flex items-center" style={{ gap: 0, padding: "8px 6px 6px" }}>
          <div style={{ width: 22, flex: "none" }} />
          <div className="flex" style={{ flex: 1, minWidth: 0, gap: 4 }}>
            {[0, 1, 2, 3, 4, 5].map((i) => (
              <div key={i} className="flex flex-col items-center" style={{ flex: 1, gap: 7, padding: "4px 0" }}>
                <Skeleton width={18} height={9} />
                <Skeleton width={22} height={21} />
                <Skeleton width={18} height={3} />
              </div>
            ))}
          </div>
          <div style={{ width: 22, flex: "none" }} />
        </div>

        {/* DÍA / SEMANA toggle — static labels, DÍA active by default */}
        <div className="flex" style={{ gap: 24, padding: "2px 22px 0" }}>
          <span className="uppercase" style={{ padding: "6px 1px 10px", borderBottom: "2px solid var(--yellow)", color: "var(--fg)", fontSize: 12, fontWeight: 700, letterSpacing: 1.4 }}>
            Día
          </span>
          <span className="uppercase" style={{ padding: "6px 1px 10px", borderBottom: "2px solid transparent", color: "var(--muted)", fontSize: 12, fontWeight: 700, letterSpacing: 1.4 }}>
            Semana
          </span>
        </div>
      </div>

      {/* DÍA content — day header + ~3 session cards */}
      <div style={{ padding: "14px 16px 24px", display: "flex", flexDirection: "column", gap: 11 }}>
        <div className="flex items-center justify-between" style={{ padding: "0 4px 2px" }}>
          <Skeleton width={120} height={11} />
          <Skeleton width={110} height={11} />
        </div>
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex items-stretch overflow-hidden border border-line bg-surface">
            <span style={{ width: 2, flex: "none", background: "transparent" }} />
            <div style={{ flex: 1, padding: "14px 16px 13px", minWidth: 0 }}>
              <div className="flex items-center" style={{ gap: 14, minWidth: 0 }}>
                <div style={{ flex: "none", width: 52 }}>
                  <Skeleton width={44} height={22} />
                  <Skeleton width={34} height={10} style={{ marginTop: 6 }} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Skeleton width="70%" height={13} />
                  <Skeleton width="45%" height={11} style={{ marginTop: 4 }} />
                </div>
                <div style={{ flex: "none", textAlign: "right", minWidth: 46 }}>
                  <Skeleton width={40} height={14} style={{ marginLeft: "auto" }} />
                  <Skeleton width={30} height={8} style={{ marginTop: 6, marginLeft: "auto" }} />
                </div>
              </div>
              <Skeleton height={2} style={{ marginTop: 13 }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
