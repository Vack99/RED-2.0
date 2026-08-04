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

      {/* Title + ratio header (#227: "N con paquete vigente de M") */}
      <div style={{ padding: "14px 22px 4px" }}>
        <H1 size={38}>CLIENTES</H1>
        <Skeleton width={170} height={12} style={{ marginTop: 9 }} />
      </div>

      {/* Search + funnel */}
      <div className="flex" style={{ padding: "14px 16px 0", gap: 8 }}>
        <Skeleton height={48} style={{ flex: 1 }} />
        <Skeleton width={52} height={48} />
      </div>

      {/* Count · orden — no sort active by default (#227: the default order is the
          engine's ruled order, not one of the three named sorts) */}
      <div className="flex items-center justify-between" style={{ padding: "14px 22px 6px" }}>
        <Skeleton width={70} height={10} />
        <div className="flex items-center">
          <span style={{ fontSize: 10, color: "var(--muted)", letterSpacing: 1, marginRight: 8 }}>ORDEN</span>
          {(["Días", "A→Z", "Asist."] as const).map((l, i) => (
            <span
              key={l}
              className="font-bold"
              style={{ padding: "10px 8px", color: "var(--muted)", fontSize: 11, letterSpacing: 0.4, marginLeft: i === 0 ? 0 : 8 }}
            >
              <span style={{ borderBottom: "1.5px solid", borderColor: "transparent", paddingBottom: 2 }}>{l}</span>
            </span>
          ))}
        </div>
      </div>

      {/* Roster rows — ~3, each with the ESTADO badge placeholder above the numeral */}
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
            <div className="shrink-0" style={{ textAlign: "right", minWidth: 84, padding: "14px 22px 14px 0" }}>
              <Skeleton width={54} height={12} style={{ marginLeft: "auto" }} />
              <Skeleton width={40} height={17} style={{ marginTop: 6, marginLeft: "auto" }} />
              <Skeleton width={28} height={10} style={{ marginTop: 5, marginLeft: "auto" }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
