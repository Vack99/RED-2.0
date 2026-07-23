import { Skeleton } from "@gym/ui/forge/skeleton";
import { AppBar, Card, Eyebrow } from "@gym/ui/forge/ui";

/**
 * Route loading fallback for the client ficha — shown instantly on soft
 * navigation while getClienteFicha's ~7-call fan-out resolves. Mirrors
 * cliente-detalle.tsx layout (same AppBar shell, identity header, PAQUETE
 * ACTIVO gauge card, action row, history rows) at matching paddings so the
 * swap to real content is not a layout jump.
 */
export default function Loading() {
  return (
    <div>
      <AppBar center="CLIENTE" />

      {/* Identity — Avatar 68 + name + meta (mirrors the real header) */}
      <div style={{ padding: "20px 22px 10px" }}>
        <div className="flex items-center" style={{ gap: 16 }}>
          <Skeleton width={68} height={68} />
          <div className="min-w-0 flex-1">
            <Skeleton width="62%" height={24} />
            <div className="flex items-center" style={{ gap: 8, marginTop: 10 }}>
              <Skeleton width={84} height={20} />
              <Skeleton width={96} height={12} />
            </div>
          </div>
        </div>
      </div>

      {/* Paquete activo — the gauge card */}
      <Card style={{ margin: "8px 16px 0" }}>
        <Eyebrow>PAQUETE ACTIVO</Eyebrow>
        <Skeleton width="55%" height={22} style={{ marginTop: 8 }} />
        <div className="flex" style={{ gap: 18, marginTop: 18 }}>
          {[0, 1].map((i) => (
            <div key={i} className="flex-1">
              <Eyebrow style={{ fontSize: 10 }}>{i === 0 ? "CLASES RESTANTES" : "DÍAS RESTANTES"}</Eyebrow>
              <Skeleton width={52} height={32} style={{ marginTop: 4 }} />
              <Skeleton height={4} style={{ marginTop: 8 }} />
              <Skeleton width="70%" height={9} style={{ marginTop: 8 }} />
            </div>
          ))}
        </div>
        <div className="flex justify-between" style={{ marginTop: 16 }}>
          <Skeleton width={120} height={12} />
          <Skeleton width={90} height={12} />
        </div>
      </Card>

      {/* Attendance control */}
      <div style={{ padding: "14px 16px 0" }}>
        <Skeleton height={52} />
      </div>

      {/* WhatsApp row */}
      <div style={{ padding: "10px 16px 0" }}>
        <Skeleton height={44} />
      </div>

      {/* Historial — a few rows */}
      <div style={{ padding: "24px 22px 10px" }}>
        <Skeleton width={180} height={11} />
      </div>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="grid items-center"
          style={{
            gridTemplateColumns: "8px 80px 1fr auto",
            gap: 14,
            padding: "12px 22px",
            borderTop: i === 0 ? "1px solid var(--line)" : "none",
            borderBottom: "1px solid var(--line)",
          }}
        >
          <Skeleton circle width={6} />
          <Skeleton width={64} height={13} />
          <Skeleton width={80} height={11} />
          <Skeleton width={36} height={12} />
        </div>
      ))}
    </div>
  );
}
