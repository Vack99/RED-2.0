"use client";

import { useRouter } from "next/navigation";
import { ForgeLockup } from "@/components/forge/brand";
import { CountUp } from "@/components/forge/count-up";
import { Icon, type IconName } from "@/components/forge/icon";
import { Avatar, Button, Card, Eyebrow, H1, SectionHeader, Tnum } from "@/components/forge/ui";
import type { ResumenMes } from "@/domain/types";
import type { AsistenciaHoy } from "@/lib/data/asistencia";

interface InicioScreenProps {
  resumen: ResumenMes;
  vigentes: number;
  totalActivos: number;
  recientes: AsistenciaHoy[];
  /** Pre-formatted greeting eyebrow (carries the year), built server-side via fmtEyebrow. */
  eyebrow: string;
}

export function InicioScreen({
  resumen,
  vigentes,
  totalActivos,
  recientes,
  eyebrow,
}: InicioScreenProps) {
  const router = useRouter();

  const {
    asistenciasHoy,
    asistenciasAyer,
    ingresosSemana,
    asistenciasSemana,
  } = resumen;

  const deltaAyer = asistenciasHoy - asistenciasAyer;
  const deltaLabel =
    deltaAyer === 0 ? "IGUAL QUE AYER" : `${deltaAyer > 0 ? "+" : ""}${deltaAyer} vs AYER`;
  const deltaColor = deltaAyer < 0 ? "var(--gold)" : "var(--green)";

  const maxSpark = Math.max(1, ...asistenciasSemana);

  return (
    <div>
      {/* Brand row */}
      <div className="flex items-center justify-between" style={{ padding: "14px 22px 16px" }}>
        <ForgeLockup size={12} />
        <button
          onClick={() => router.push("/cuenta")}
          className="border border-line bg-surface font-extrabold"
          style={{ width: 36, height: 36, padding: 0, color: "var(--silver)", fontSize: 11, letterSpacing: 0.6, cursor: "pointer" }}
        >
          JC
        </button>
      </div>

      {/* Greeting */}
      <div style={{ padding: "0 22px 14px" }}>
        <Eyebrow>{eyebrow}</Eyebrow>
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
          <span style={{ fontSize: 10.5, color: deltaColor, letterSpacing: 0.6, fontWeight: 700 }}>
            {deltaLabel}
          </span>
        </div>
        <div className="flex items-end" style={{ gap: 10, marginTop: 8 }}>
          <CountUp
            value={asistenciasHoy}
            className="font-extrabold"
            style={{ fontSize: 76, lineHeight: 0.85, letterSpacing: -2.5, color: "var(--fg)" }}
          />
          <span style={{ fontSize: 13, color: "var(--muted)", paddingBottom: 10 }}>de pase registrado</span>
        </div>
        {/* sparkline — real last-7-days series, oldest→newest ending today */}
        <div className="flex items-end" style={{ gap: 4, marginTop: 16, height: 30 }}>
          {asistenciasSemana.map((v, i) => (
            <div
              key={i}
              className="flex-1 transition-all"
              style={{
                height: `${Math.max(6, (v / maxSpark) * 100)}%`,
                background: i === asistenciasSemana.length - 1 ? "var(--yellow)" : "var(--muted-soft)",
              }}
            />
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
          <div className="flex items-baseline" style={{ gap: 4, marginTop: 4 }}>
            <Tnum className="font-extrabold" style={{ fontSize: 28, lineHeight: 1 }}>{vigentes}</Tnum>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>/ {totalActivos}</span>
          </div>
        </Card>
        <Card style={{ padding: "14px 16px" }}>
          <Eyebrow>SEMANA · INGRESOS</Eyebrow>
          <Tnum className="font-extrabold" style={{ display: "block", marginTop: 4, fontSize: 22, lineHeight: 1, letterSpacing: -0.4 }}>
            ${ingresosSemana.toLocaleString("es-MX")}
          </Tnum>
        </Card>
      </div>

      {/* Big CTA */}
      <div style={{ padding: "16px 16px 0" }}>
        <Button variant="primary" size="lg" full iconRight="arrow" onClick={() => router.push("/asistencia")}>
          PASE DE LISTA
        </Button>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2" style={{ padding: "20px 16px 0", gap: 8 }}>
        <QuickAction
          icon="flame"
          label="POR VENCER"
          sub="Revisar roster"
          onClick={() => router.push("/clientes")}
        />
        <QuickAction icon="user" label="NUEVO CLIENTE" sub="Registrar venta" onClick={() => router.push("/vender")} />
      </div>

      {/* Recent activity — today's real asistencias, ordered by time */}
      <SectionHeader trailing="HOY">ÚLTIMAS ASISTENCIAS</SectionHeader>
      <div>
        {recientes.map((row, i) => (
          <button
            key={`${row.cliente_id}-${i}`}
            onClick={() => router.push(`/clientes/${row.cliente_id}`)}
            className="flex w-full items-center text-left"
            style={{
              gap: 14,
              padding: "12px 22px",
              background: "transparent",
              borderTop: i === 0 ? "1px solid var(--line)" : "none",
              borderBottom: "1px solid var(--line)",
              cursor: "pointer",
            }}
          >
            <Avatar initial={row.inicial} size={38} />
            <div className="min-w-0 flex-1">
              <div className="uppercase font-semibold" style={{ fontSize: 14, color: "var(--fg)", letterSpacing: 0.4 }}>
                {row.nombre}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>
                {row.hora ? <Tnum>{row.hora}</Tnum> : "hoy"} · {row.paquete}
              </div>
            </div>
            <div className="flex items-center justify-center" style={{ width: 22, height: 22, background: "var(--green-soft)" }}>
              <Icon name="check" size={12} color="var(--green)" />
            </div>
          </button>
        ))}
        {recientes.length === 0 && (
          <div
            className="uppercase"
            style={{ padding: "28px 22px", textAlign: "center", fontSize: 11, color: "var(--muted)", letterSpacing: 1 }}
          >
            Aún no hay asistencias hoy
          </div>
        )}
      </div>

      <div style={{ height: 32 }} />
    </div>
  );
}

function QuickAction({
  icon,
  label,
  sub,
  onClick,
}: {
  icon: IconName;
  label: string;
  sub?: string;
  onClick?: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex flex-col border border-line bg-surface text-left"
      style={{ padding: 16, gap: 14, cursor: "pointer", color: "var(--fg)" }}
    >
      <Icon name={icon} size={22} color="var(--gold)" />
      <div>
        <div className="font-extrabold" style={{ fontSize: 11.5, letterSpacing: 1.2 }}>{label}</div>
        {sub && <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 4, letterSpacing: 0.4 }}>{sub}</div>}
      </div>
    </button>
  );
}
