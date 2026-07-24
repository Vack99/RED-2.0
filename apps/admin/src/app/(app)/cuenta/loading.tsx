import { Skeleton } from "@gym/ui/forge/skeleton";
import { AppBar, Card, Eyebrow, SectionHeader } from "@gym/ui/forge/ui";

/**
 * Route loading fallback for the CUENTA screen (the heaviest admin route:
 * serial getOperatorGym + 14 parallel reads). Mirrors cuenta.tsx region
 * geometry — identity header, RESUMEN card, RESPALDO form, PAQUETES + AJUSTES
 * lists, footer — at matching paddings so the swap to real content has no jump.
 */
export default function Loading() {
  return (
    <div>
      <AppBar center="CUENTA" trailing={<Skeleton width={38} height={38} />} />

      {/* Coach identity — Avatar 72 (square) + name + tel + badge */}
      <div className="flex items-center" style={{ padding: "20px 22px 16px", gap: 16 }}>
        <Skeleton width={72} height={72} />
        <div className="min-w-0 flex-1">
          <Skeleton width="58%" height={24} />
          <Skeleton width={110} height={12} style={{ marginTop: 8 }} />
          <Skeleton width={150} height={18} style={{ marginTop: 8 }} />
        </div>
      </div>

      {/* Resumen del mes — 3-up stat grid, static eyebrows + skeleton figures */}
      <SectionHeader trailing={<Skeleton width={72} height={11} />}>RESUMEN DEL MES</SectionHeader>
      <Card style={{ margin: "0 16px" }}>
        <div className="grid grid-cols-3" style={{ gap: 18 }}>
          {(["INGRESOS", "VENTAS", "ASIST."] as const).map((label) => (
            <div key={label}>
              <Eyebrow style={{ fontSize: 9.5 }}>{label}</Eyebrow>
              <Skeleton width="80%" height={22} style={{ marginTop: 4 }} />
              <Skeleton width="60%" height={10} style={{ marginTop: 6 }} />
            </div>
          ))}
        </div>
      </Card>

      {/* Respaldo — the download form's fixed chrome; select options are data */}
      <SectionHeader>RESPALDO</SectionHeader>
      <div style={{ margin: "0 16px" }}>
        <div
          className="flex w-full items-center border border-line bg-surface"
          style={{ gap: 14, padding: "14px 16px" }}
        >
          <Skeleton width={32} height={32} />
          <div className="min-w-0 flex-1">
            <div className="font-bold" style={{ fontSize: 12.5, letterSpacing: 0.6 }}>
              DESCARGAR RESPALDO
            </div>
            <Skeleton height={30} style={{ marginTop: 6 }} />
          </div>
          <Skeleton width={72} height={12} />
        </div>
      </div>

      {/* Paquetes y precios — ~3 placeholder rows of the real catalog list */}
      <SectionHeader trailing={<Skeleton width={44} height={11} />}>PAQUETES Y PRECIOS</SectionHeader>
      <div style={{ margin: "0 16px" }}>
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className="flex w-full items-center justify-between border border-line bg-surface"
            style={{
              gap: 12,
              padding: "14px 16px",
              borderBottom: i === 2 ? "1px solid var(--line)" : "none",
              marginTop: i === 0 ? 0 : -1,
            }}
          >
            <div className="min-w-0">
              <Skeleton width={120} height={14} />
              <Skeleton width={90} height={10} style={{ marginTop: 5 }} />
            </div>
            <Skeleton width={64} height={18} />
          </div>
        ))}
      </div>

      {/* Ajustes — the fixed 8-row menu: static labels, skeleton icon + sub */}
      <SectionHeader>AJUSTES</SectionHeader>
      <div style={{ margin: "0 16px" }}>
        {[
          "COACHES",
          "TIPOS DE CLASE",
          "PLANTILLAS DE WHATSAPP",
          "CONTENIDO DEL GIMNASIO",
          "MENSAJES",
          "NOTIFICACIONES",
          "DATOS DE COBRO",
          "EDITAR PERFIL",
        ].map((label, i, rows) => (
          <div
            key={label}
            className="flex w-full items-center border border-line bg-surface"
            style={{
              gap: 14,
              padding: "14px 16px",
              borderBottom: i === rows.length - 1 ? "1px solid var(--line)" : "none",
              marginTop: i === 0 ? 0 : -1,
            }}
          >
            <Skeleton width={32} height={32} />
            <div className="min-w-0 flex-1">
              <div className="font-bold" style={{ fontSize: 12.5, letterSpacing: 0.6 }}>
                {label}
              </div>
              <Skeleton width={140} height={11} style={{ marginTop: 4 }} />
            </div>
            <Skeleton width={14} height={14} />
          </div>
        ))}
      </div>

      {/* Footer — logout affordance + version line */}
      <div
        className="flex flex-col items-center"
        style={{ padding: "24px 22px 28px", marginTop: 16, borderTop: "1px solid var(--line)", gap: 14 }}
      >
        <Skeleton width={160} height={24} />
        <Skeleton width={120} height={10} />
      </div>
    </div>
  );
}
