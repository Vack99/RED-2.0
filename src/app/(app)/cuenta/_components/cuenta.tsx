"use client";

import { Icon, type IconName } from "@/components/forge/icon";
import { ThemeToggle } from "@/components/forge/theme-toggle";
import { forgeToast } from "@/components/forge/toaster";
import {
  AppBar,
  Avatar,
  Badge,
  Card,
  Eyebrow,
  H1,
  SectionHeader,
  Tnum,
} from "@/components/forge/ui";
import { HOY } from "@/lib/data/seed";
import {
  perfilInicial,
  useCobro,
  usePaquetes,
  usePerfil,
  usePlantillas,
} from "@/lib/data/store";

// Sub-screens (Paquetes editor, Plantillas, Cobro, Perfil) arrive in
// pass 2. For now their entry points surface a "próximamente" toast.
function proximamente(label: string) {
  forgeToast({ tone: "info", title: "Próximamente", body: `${label} llega en la siguiente entrega.` });
}

export function CuentaScreen() {
  const [paquetes] = usePaquetes();
  const [plantillas] = usePlantillas();
  const [perfil] = usePerfil();
  const [cobro] = useCobro();

  const metActivos = Object.values(cobro.metodos || {}).filter(Boolean).length;
  const cobroSub = `${metActivos} método${metActivos === 1 ? "" : "s"}${cobro.banco?.trim() ? " · " + cobro.banco.trim() : ""}`;

  const ajustes: { icon: IconName; label: string; sub: string; onClick: () => void }[] = [
    { icon: "wa", label: "PLANTILLAS DE WHATSAPP", sub: `${plantillas.length} configurada${plantillas.length === 1 ? "" : "s"}`, onClick: () => proximamente("Plantillas de WhatsApp") },
    { icon: "bell", label: "NOTIFICACIONES", sub: "Próximamente", onClick: () => proximamente("Notificaciones") },
    { icon: "card", label: "DATOS DE COBRO", sub: cobroSub, onClick: () => proximamente("Datos de cobro") },
    { icon: "user", label: "EDITAR PERFIL", sub: "Nombre, teléfono, contraseña", onClick: () => proximamente("Editar perfil") },
  ];

  return (
    <div>
      <AppBar center="CUENTA" trailing={<ThemeToggle />} />

      {/* Coach identity */}
      <div className="flex items-center" style={{ padding: "20px 22px 16px", gap: 16 }}>
        <Avatar initial={perfilInicial(perfil)} accent size={72} style={{ fontSize: 26 }} />
        <div className="min-w-0 flex-1">
          <H1 size={24} style={{ letterSpacing: -0.3, lineHeight: 1.05 }}>
            {perfil.nombre?.trim() || "Coach"}
          </H1>
          <Tnum style={{ display: "block", marginTop: 6, fontSize: 11.5, color: "var(--muted)" }}>{perfil.tel}</Tnum>
          <div style={{ marginTop: 6 }}>
            <Badge state="success">
              {`${perfil.negocio?.trim() || "Negocio"} · ${perfil.ciudad?.trim() || "—"}`.toUpperCase()}
            </Badge>
          </div>
        </div>
      </div>

      {/* Resumen del mes */}
      <SectionHeader trailing="MAYO 2026">RESUMEN DEL MES</SectionHeader>
      <Card style={{ margin: "0 16px" }}>
        <div className="grid grid-cols-3" style={{ gap: 18 }}>
          <div>
            <Eyebrow style={{ fontSize: 9.5 }}>INGRESOS</Eyebrow>
            <Tnum className="font-extrabold" style={{ display: "block", marginTop: 4, fontSize: 22, lineHeight: 1, letterSpacing: -0.4 }}>
              ${HOY.ingresosMes.toLocaleString("es-MX")}
            </Tnum>
            <div style={{ fontSize: 10, color: "var(--green)", marginTop: 4, fontWeight: 700 }}>+18% VS ABR</div>
          </div>
          <div>
            <Eyebrow style={{ fontSize: 9.5 }}>VENTAS</Eyebrow>
            <Tnum className="font-extrabold" style={{ display: "block", marginTop: 4, fontSize: 22, lineHeight: 1 }}>{HOY.ventasMes}</Tnum>
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4, fontWeight: 600 }}>PAQUETES</div>
          </div>
          <div>
            <Eyebrow style={{ fontSize: 9.5 }}>ASIST.</Eyebrow>
            <Tnum className="font-extrabold" style={{ display: "block", marginTop: 4, fontSize: 22, lineHeight: 1 }}>{HOY.asistMes}</Tnum>
            <div style={{ fontSize: 10, color: "var(--muted)", marginTop: 4, fontWeight: 600 }}>REGISTRADAS</div>
          </div>
        </div>
      </Card>

      {/* Paquetes y precios */}
      <SectionHeader
        trailing={
          <button
            onClick={() => proximamente("Editor de paquetes")}
            className="inline-flex items-center uppercase font-extrabold"
            style={{ gap: 5, background: "transparent", border: "none", cursor: "pointer", padding: 0, fontSize: 10.5, letterSpacing: 1.2, color: "var(--gold)" }}
          >
            <Icon name="edit" size={12} color="var(--gold)" />
            EDITAR
          </button>
        }
      >
        PAQUETES Y PRECIOS
      </SectionHeader>
      <div style={{ margin: "0 16px" }}>
        {paquetes.map((p, i) => (
          <button
            key={p.id}
            onClick={() => proximamente("Editor de paquetes")}
            className="flex w-full items-center justify-between border border-line bg-surface text-left"
            style={{
              gap: 12,
              padding: "14px 16px",
              borderBottom: i === paquetes.length - 1 ? "1px solid var(--line)" : "none",
              marginTop: i === 0 ? 0 : -1,
              cursor: "pointer",
              color: "var(--fg)",
            }}
          >
            <div className="min-w-0">
              <div className="flex items-center" style={{ gap: 7 }}>
                <div className="uppercase font-bold" style={{ fontSize: 14, letterSpacing: 0.4 }}>{p.nombre?.trim() || "Sin nombre"}</div>
                {p.popular && <Icon name="star" size={11} color="var(--gold)" />}
              </div>
              <div className="uppercase" style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 3, letterSpacing: 0.6 }}>
                {p.vigencia?.trim() ? `VIGENCIA · ${p.vigencia.toUpperCase()}` : "SIN VIGENCIA"}
              </div>
            </div>
            <div className="flex shrink-0 items-center" style={{ gap: 12 }}>
              <Tnum className="font-extrabold" style={{ fontSize: 18 }}>${p.precio.toLocaleString("es-MX")}</Tnum>
              <Icon name="chev" size={14} color="var(--muted)" />
            </div>
          </button>
        ))}
      </div>

      {/* Ajustes */}
      <SectionHeader>AJUSTES</SectionHeader>
      <div style={{ margin: "0 16px" }}>
        {ajustes.map((row, i) => (
          <button
            key={row.label}
            onClick={row.onClick}
            className="flex w-full items-center border border-line bg-surface text-left"
            style={{
              gap: 14,
              padding: "14px 16px",
              borderBottom: i === ajustes.length - 1 ? "1px solid var(--line)" : "none",
              marginTop: i === 0 ? 0 : -1,
              cursor: "pointer",
              color: "var(--fg)",
            }}
          >
            <div className="flex shrink-0 items-center justify-center border border-line" style={{ width: 32, height: 32, background: "var(--canvas)" }}>
              <Icon name={row.icon} size={15} color="var(--gold)" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="font-bold" style={{ fontSize: 12.5, letterSpacing: 0.6 }}>{row.label}</div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{row.sub}</div>
            </div>
            <Icon name="chev" size={14} color="var(--muted)" />
          </button>
        ))}
      </div>

      <div className="uppercase" style={{ padding: "32px 22px 28px", textAlign: "center", fontSize: 10, color: "var(--muted-soft)", letterSpacing: 1.6 }}>
        FORGE BOOTCAMP · v0.9 (MVP)
      </div>
    </div>
  );
}
