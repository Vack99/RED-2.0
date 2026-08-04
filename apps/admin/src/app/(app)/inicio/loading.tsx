import { Skeleton } from "@gym/ui/forge/skeleton";
import { Card, Eyebrow, H1, SectionHeader } from "@gym/ui/forge/ui";

/**
 * Route loading fallback mirroring inicio.tsx — brand row, greeting, ASISTENCIAS
 * hero, stat pair, online tile, PASE CTA, quick actions, recent-asistencias rows.
 */
export default function Loading() {
  return (
    <div>
      {/* Brand row — lockup + the account "D" button */}
      <div className="flex items-center justify-between" style={{ padding: "14px 22px 16px" }}>
        <Skeleton width={104} height={20} />
        <Skeleton width={36} height={36} />
      </div>

      {/* Greeting — data eyebrow (server-formatted date) + static H1 */}
      <div style={{ padding: "0 22px 14px" }}>
        <Skeleton width={150} height={11} />
        <H1 size={40} style={{ marginTop: 8 }}>
          BUENOS DÍAS,
          <br />
          <span style={{ color: "var(--gold)" }}>COACH.</span>
        </H1>
      </div>

      {/* Hero — asistencias hoy */}
      <Card glow style={{ margin: "12px 16px 0" }}>
        <div className="flex items-start justify-between">
          <Eyebrow>ASISTENCIAS · HOY</Eyebrow>
          <Skeleton width={88} height={11} />
        </div>
        <div className="flex items-end" style={{ gap: 10, marginTop: 8 }}>
          <Skeleton width={92} height={64} />
          <span style={{ fontSize: 13, color: "var(--muted)", paddingBottom: 10 }}>de pase registrado</span>
        </div>
        {/* sparkline — the last-7-days series */}
        <div className="flex items-end" style={{ gap: 4, marginTop: 16, height: 30 }}>
          {[0, 1, 2, 3, 4, 5, 6].map((i) => (
            <Skeleton key={i} height={30} style={{ flex: 1 }} />
          ))}
        </div>
        <div className="flex justify-between" style={{ marginTop: 8, fontSize: 10, color: "var(--muted)", letterSpacing: 1 }}>
          <span>7 DÍAS ATRÁS</span>
          <span>HOY</span>
        </div>
      </Card>

      {/* Secondary stats */}
      <div className="grid grid-cols-2" style={{ padding: "10px 16px 0", gap: 8 }}>
        <Card style={{ padding: "14px 16px" }}>
          <Eyebrow>VIGENTES</Eyebrow>
          <Skeleton width={64} height={28} style={{ marginTop: 4 }} />
        </Card>
        <Card style={{ padding: "14px 16px" }}>
          <Eyebrow>SEMANA · INGRESOS</Eyebrow>
          <Skeleton width={96} height={22} style={{ marginTop: 4 }} />
        </Card>
      </div>

      {/* Nuevos registros online tile */}
      <div style={{ padding: "10px 16px 0" }}>
        <div className="flex items-center border border-line bg-surface" style={{ padding: "14px 16px", gap: 14 }}>
          <Skeleton width={34} height={34} />
          <div className="min-w-0 flex-1">
            <Eyebrow>NUEVOS REGISTROS ONLINE</Eyebrow>
            <Skeleton width={130} height={10} style={{ marginTop: 5 }} />
          </div>
          <Skeleton width={30} height={26} />
          <Skeleton width={14} height={14} />
        </div>
      </div>

      {/* Big CTA — PASE DE LISTA */}
      <div style={{ padding: "16px 16px 0" }}>
        <Skeleton height={54} />
      </div>

      {/* Quick actions — POR VENCER is gone (#228), replaced by the POR RENOVAR
          tile below; static label, skeleton icon */}
      <div style={{ padding: "20px 16px 0" }}>
        <div className="flex flex-col border border-line bg-surface" style={{ padding: 16, gap: 14 }}>
          <Skeleton width={22} height={22} />
          <div>
            <div className="font-extrabold" style={{ fontSize: 11.5, letterSpacing: 1.2 }}>NUEVO CLIENTE</div>
            <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 4, letterSpacing: 0.4 }}>
              Registrar venta
            </div>
          </div>
        </div>
      </div>

      {/* MEMBRESÍAS — the POR RENOVAR tile's section header (#228 opus review F10),
          then the tile itself: header row + 6-cell bucket grid + CTA footer,
          mirroring inicio.tsx's RenovarTile shape. `total` isn't known yet, so the
          trailing "N SOCIOS" is a skeleton too. */}
      <SectionHeader trailing={<Skeleton width={70} height={10.5} />}>MEMBRESÍAS</SectionHeader>
      <div style={{ padding: "0 16px" }}>
        <div style={{ border: "1px solid var(--line)", background: "var(--surface)" }}>
          <div className="flex items-center" style={{ gap: 10, padding: "13px 16px 12px", borderBottom: "1px solid var(--line)" }}>
            <Skeleton width={15} height={15} />
            <div className="min-w-0 flex-1">
              <Eyebrow>POR RENOVAR</Eyebrow>
              <Skeleton width={150} height={10} style={{ marginTop: 5 }} />
            </div>
            <Skeleton width={30} height={26} />
          </div>
          <div style={{ padding: "12px 16px 14px" }}>
            <div className="grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <Skeleton key={i} height={50} />
              ))}
            </div>
          </div>
          <div style={{ padding: "12px 16px", borderTop: "1px solid var(--line)" }}>
            <Skeleton height={13} />
          </div>
        </div>
      </div>

      {/* Recent activity — ~3 rows */}
      <SectionHeader trailing="HOY">ÚLTIMAS ASISTENCIAS</SectionHeader>
      <div>
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
            <Skeleton width={38} height={38} />
            <div className="min-w-0 flex-1">
              <Skeleton width="52%" height={14} />
              <Skeleton width={120} height={11} style={{ marginTop: 5 }} />
            </div>
            <Skeleton width={22} height={22} />
          </div>
        ))}
      </div>

      <div style={{ height: 32 }} />
    </div>
  );
}
