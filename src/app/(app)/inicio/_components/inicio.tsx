"use client";

import { useRouter } from "next/navigation";
import { ForgeLockup } from "@/components/forge/brand";
import { CountUp } from "@/components/forge/count-up";
import { Icon, type IconName } from "@/components/forge/icon";
import { Avatar, Button, Card, Eyebrow, H1, SectionHeader, Tnum } from "@/components/forge/ui";
import { useClientes } from "@/lib/data/store";
import { HOY } from "@/lib/data/seed";
import { firstName } from "@/lib/format";

const SPARK = [6, 9, 7, 12, 8, 11, 12, 10, 13, 9, 12, 14];

export function InicioScreen() {
  const router = useRouter();
  const [clientes] = useClientes();

  const porVencer = clientes
    .filter((c) => c.diasRest <= 5)
    .sort((a, b) => a.diasRest - b.diasRest);

  const recientes = [
    { c: clientes[10], t: "08:32", tag: "Ilimitado" },
    { c: clientes[3], t: "08:30", tag: "Ilimitado" },
    { c: clientes[0], t: "07:31", tag: "Ilimitado" },
    { c: clientes[1], t: "07:30", tag: "12 cl · 4 rest" },
  ].filter((r) => r.c);

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
        <Eyebrow>JUEVES · 27 MAYO 2026</Eyebrow>
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
          <span style={{ fontSize: 10.5, color: "var(--green)", letterSpacing: 0.6, fontWeight: 700 }}>
            +2 vs AYER
          </span>
        </div>
        <div className="flex items-end" style={{ gap: 10, marginTop: 8 }}>
          <CountUp
            value={HOY.asistenciasHoy}
            className="font-extrabold"
            style={{ fontSize: 76, lineHeight: 0.85, letterSpacing: -2.5, color: "var(--fg)" }}
          />
          <span style={{ fontSize: 13, color: "var(--muted)", paddingBottom: 10 }}>de pase registrado</span>
        </div>
        {/* sparkline */}
        <div className="flex items-end" style={{ gap: 4, marginTop: 16, height: 30 }}>
          {SPARK.map((v, i) => (
            <div
              key={i}
              className="flex-1 transition-all"
              style={{ height: `${(v / 14) * 100}%`, background: i === SPARK.length - 1 ? "var(--yellow)" : "var(--muted-soft)" }}
            />
          ))}
        </div>
        <div className="flex justify-between" style={{ marginTop: 8, fontSize: 10, color: "var(--muted)", letterSpacing: 1 }}>
          <span>12 SEM ATRÁS</span>
          <span>HOY</span>
        </div>
      </Card>

      {/* Secondary stats */}
      <div className="grid grid-cols-2" style={{ padding: "10px 16px 0", gap: 8 }}>
        <Card style={{ padding: "14px 16px" }}>
          <Eyebrow>VIGENTES</Eyebrow>
          <div className="flex items-baseline" style={{ gap: 4, marginTop: 4 }}>
            <Tnum className="font-extrabold" style={{ fontSize: 28, lineHeight: 1 }}>{HOY.vigentes}</Tnum>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>/ {HOY.totalClientes}</span>
          </div>
        </Card>
        <Card style={{ padding: "14px 16px" }}>
          <Eyebrow>SEMANA · INGRESOS</Eyebrow>
          <Tnum className="font-extrabold" style={{ display: "block", marginTop: 4, fontSize: 22, lineHeight: 1, letterSpacing: -0.4 }}>
            ${HOY.ingresosSemana.toLocaleString("es-MX")}
          </Tnum>
        </Card>
      </div>

      {/* Big CTA */}
      <div style={{ padding: "16px 16px 0" }}>
        <Button variant="primary" size="lg" full iconRight="arrow" onClick={() => router.push("/asistencia")}>
          PASE DE LISTA
        </Button>
      </div>

      {/* Retention alert (Retención screen lands in pass 2 → routes to clientes) */}
      {porVencer.length > 0 && (
        <button
          onClick={() => router.push("/clientes")}
          className="flex items-center text-left"
          style={{
            margin: "14px 16px 0",
            padding: "14px 16px",
            background: "transparent",
            border: "1px solid var(--yellow-edge)",
            gap: 12,
            cursor: "pointer",
            width: "calc(100% - 32px)",
            color: "var(--fg)",
          }}
        >
          <Icon name="alert" size={18} color="var(--gold)" />
          <div className="flex-1">
            <div className="uppercase font-bold" style={{ fontSize: 13, letterSpacing: 0.5 }}>
              {porVencer.length} {porVencer.length === 1 ? "CLIENTE VENCE" : "CLIENTES VENCEN"} ESTA SEMANA
            </div>
            <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>
              {porVencer.slice(0, 3).map((c) => firstName(c.nombre)).join(", ")} — mandar recordatorio
            </div>
          </div>
          <Icon name="arrow" size={16} color="var(--gold)" />
        </button>
      )}

      {/* Quick actions */}
      <div className="grid grid-cols-2" style={{ padding: "20px 16px 0", gap: 8 }}>
        <QuickAction
          icon="flame"
          label="POR VENCER"
          sub={porVencer.length ? `${porVencer.length} esta semana` : "Todo al día"}
          onClick={() => router.push("/clientes")}
        />
        <QuickAction icon="user" label="NUEVO CLIENTE" sub="Registrar venta" onClick={() => router.push("/vender")} />
      </div>

      {/* Recent activity */}
      <SectionHeader trailing="HOY">ÚLTIMAS ASISTENCIAS</SectionHeader>
      <div>
        {recientes.map((row, i) => (
          <button
            key={row.c.id}
            onClick={() => router.push(`/clientes/${row.c.id}`)}
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
            <Avatar initial={row.c.inicial} size={38} />
            <div className="min-w-0 flex-1">
              <div className="uppercase font-semibold" style={{ fontSize: 14, color: "var(--fg)", letterSpacing: 0.4 }}>
                {row.c.nombre}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>
                <Tnum>{row.t}</Tnum> · {row.tag}
              </div>
            </div>
            <div className="flex items-center justify-center" style={{ width: 22, height: 22, background: "var(--green-soft)" }}>
              <Icon name="check" size={12} color="var(--green)" />
            </div>
          </button>
        ))}
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
