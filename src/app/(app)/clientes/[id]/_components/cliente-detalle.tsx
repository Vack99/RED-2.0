"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/forge/icon";
import { forgeToast } from "@/components/forge/toaster";
import {
  AppBar,
  Avatar,
  Badge,
  Button,
  Card,
  Eyebrow,
  H1,
  SectionHeader,
  Tnum,
} from "@/components/forge/ui";
import { useAsistTimes, useClientes, usePase } from "@/lib/data/store";
import { firstName, waLink } from "@/lib/format";

const HISTORIAL = [
  { d: "mié 27", t: "07:30", tag: "Funcional" },
  { d: "lun 25", t: "18:00", tag: "Funcional" },
  { d: "vie 22", t: "07:30", tag: "Funcional" },
  { d: "mié 20", t: "07:30", tag: "Funcional" },
  { d: "lun 18", t: "19:00", tag: "Funcional" },
];
const PAGOS = [
  { d: "13 may", p: "12 clases", m: "$1,100", met: "Efectivo" },
  { d: "20 abr", p: "8 clases", m: "$750", met: "Transferencia" },
  { d: "02 abr", p: "8 clases", m: "$750", met: "Efectivo" },
];

export function ClienteDetalle({ id }: { id: number }) {
  const router = useRouter();
  const [clientes] = useClientes();
  const [grid, setGrid] = usePase();
  const [times, setTimes] = useAsistTimes();

  const idx = Math.max(0, clientes.findIndex((x) => x.id === id));
  const c = clientes[idx];

  const present = (grid[0] ?? []).includes(c?.id);
  const asistHoy = present ? times[c?.id] ?? "07:30" : null;

  // Swipe between clients.
  const prevC = idx > 0 ? clientes[idx - 1] : null;
  const nextC = idx < clientes.length - 1 ? clientes[idx + 1] : null;
  const swipe = React.useRef({ x: 0, dx: 0, on: false });
  const [dx, setDx] = React.useState(0);

  if (!c) {
    return (
      <div style={{ padding: 40, color: "var(--muted)" }}>Cliente no encontrado.</div>
    );
  }

  const marcar = () => {
    const t = new Date().toLocaleTimeString("es-MX", { hour: "2-digit", minute: "2-digit", hour12: false });
    setGrid((g) => ({ ...g, 0: (g[0] ?? []).includes(c.id) ? g[0] ?? [] : [...(g[0] ?? []), c.id] }));
    setTimes((m) => ({ ...m, [c.id]: t }));
    forgeToast({ tone: "success", title: "Asistencia registrada", body: `${c.nombre} · hoy ${t}` });
  };
  const quitar = () => {
    setGrid((g) => ({ ...g, 0: (g[0] ?? []).filter((x) => x !== c.id) }));
    setTimes((m) => {
      const n = { ...m };
      delete n[c.id];
      return n;
    });
    forgeToast({ tone: "warning", title: "Asistencia quitada", body: `Se deshizo el registro de hoy de ${firstName(c.nombre)}.` });
  };
  const mensaje = () => {
    const text = `Hola ${firstName(c.nombre)} 👋 Aún tienes ${c.clasesRest === "∞" ? "clases ilimitadas" : `${c.clasesRest} clases`} de tu paquete (${c.paquete}), vence el ${c.vence}. ¡Te esperamos! 💪 — Forge Bootcamp`;
    window.open(waLink(c.tel, text), "_blank");
  };

  const restRatio = c.clasesRest === "∞" ? 1 : Math.max(0.06, (c.clasesRest as number) / (c.totalClases as number));
  const dayDenom = c.paquete.startsWith("8") ? 20 : c.paquete.startsWith("12") ? 25 : 30;
  const dayRatio = Math.max(0.04, c.diasRest / dayDenom);

  const onTouchStart = (e: React.TouchEvent) => (swipe.current = { x: e.touches[0].clientX, dx: 0, on: true });
  const onTouchMove = (e: React.TouchEvent) => {
    if (!swipe.current.on) return;
    swipe.current.dx = e.touches[0].clientX - swipe.current.x;
    setDx(swipe.current.dx);
  };
  const onTouchEnd = () => {
    const cur = swipe.current.dx;
    swipe.current.on = false;
    if (cur < -80 && nextC) router.replace(`/clientes/${nextC.id}`);
    else if (cur > 80 && prevC) router.replace(`/clientes/${prevC.id}`);
    setDx(0);
  };

  return (
    <div>
      <AppBar
        onBack={() => router.push("/clientes")}
        center={`#${String(c.id).padStart(3, "0")} · CLIENTE`}
        trailing={
          <button
            onClick={() => forgeToast({ tone: "info", title: "Próximamente", body: "Editar cliente llega en la siguiente entrega." })}
            aria-label="Editar"
            className="flex items-center justify-center border border-line bg-surface"
            style={{ width: 38, height: 38, padding: 0, cursor: "pointer" }}
          >
            <Icon name="edit" size={14} color="var(--muted)" />
          </button>
        }
      />

      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        style={{ transform: `translateX(${dx}px)`, transition: dx === 0 ? "transform 240ms cubic-bezier(.32,.72,0,1)" : "none" }}
      >
        {/* Identity */}
        <div style={{ padding: "20px 22px 10px" }}>
          <div className="flex items-center" style={{ gap: 16 }}>
            <Avatar initial={c.inicial} accent size={68} style={{ fontSize: 24 }} />
            <div className="min-w-0 flex-1">
              <H1 size={24} style={{ letterSpacing: -0.3, lineHeight: 1.05 }}>{c.nombre}</H1>
              <div className="flex flex-wrap items-center" style={{ gap: 8, marginTop: 8, fontSize: 11.5, color: "var(--muted)" }}>
                <Badge state={c.estado} />
                {asistHoy && (
                  <span className="inline-flex items-center uppercase font-extrabold" style={{ gap: 5, padding: "4px 8px", background: "var(--green)", color: "var(--canvas)", fontSize: 9.5, letterSpacing: 1.1 }}>
                    <Icon name="check" size={11} color="var(--canvas)" strokeWidth={2.6} />
                    ASISTIÓ HOY · <Tnum style={{ fontWeight: 800 }}>{asistHoy}</Tnum>
                  </span>
                )}
                <Tnum>{c.tel}</Tnum>
              </div>
            </div>
          </div>
        </div>

        {/* Paquete activo */}
        <Card style={{ margin: "8px 16px 0" }}>
          <div className="flex items-start justify-between">
            <Eyebrow>PAQUETE ACTIVO</Eyebrow>
            <Eyebrow color="var(--muted)">
              VENCE <span style={{ color: c.diasRest <= 5 ? "var(--yellow)" : "var(--fg)" }}>{c.vence.toUpperCase()}</span>
            </Eyebrow>
          </div>
          <H1 size={22} style={{ marginTop: 8 }}>{c.paquete}</H1>

          <div className="flex" style={{ gap: 18, marginTop: 18 }}>
            <div className="flex-1">
              <Eyebrow style={{ fontSize: 10 }}>CLASES RESTANTES</Eyebrow>
              <div className="flex items-baseline" style={{ gap: 4, marginTop: 4 }}>
                <Tnum className="font-extrabold" style={{ fontSize: 32, lineHeight: 1 }}>{c.clasesRest}</Tnum>
                {c.clasesRest !== "∞" && <span style={{ fontSize: 13, color: "var(--muted)" }}>/ {c.totalClases}</span>}
              </div>
              <div style={{ height: 4, background: "var(--line-soft)", marginTop: 8, overflow: "hidden" }}>
                <div style={{ width: `${restRatio * 100}%`, height: "100%", background: "var(--yellow)", transition: "width 600ms cubic-bezier(.32,.72,0,1)" }} />
              </div>
            </div>
            <div className="flex-1">
              <Eyebrow style={{ fontSize: 10 }}>DÍAS RESTANTES</Eyebrow>
              <div className="flex items-baseline" style={{ gap: 4, marginTop: 4 }}>
                <Tnum className="font-extrabold" style={{ fontSize: 32, lineHeight: 1, color: c.diasRest <= 5 ? "var(--yellow)" : "var(--fg)" }}>{c.diasRest}</Tnum>
                <span style={{ fontSize: 13, color: "var(--muted)" }}>/ {dayDenom}</span>
              </div>
              <div style={{ height: 4, background: "var(--line-soft)", marginTop: 8, overflow: "hidden" }}>
                <div style={{ width: `${dayRatio * 100}%`, height: "100%", background: c.diasRest <= 5 ? "var(--yellow)" : "var(--green)", transition: "width 600ms cubic-bezier(.32,.72,0,1)" }} />
              </div>
            </div>
          </div>
          <div className="flex justify-between" style={{ marginTop: 16, fontSize: 11.5, color: "var(--muted)" }}>
            <span>COMPRADO <Tnum style={{ color: "var(--fg)" }}>13 MAY</Tnum></span>
            <span>ALTA <Tnum style={{ color: "var(--fg)" }}>14 ABR</Tnum></span>
          </div>
        </Card>

        {/* Attendance control = today indicator */}
        <div style={{ padding: "14px 16px 0" }}>
          {asistHoy ? (
            <>
              <div className="flex items-center" style={{ gap: 12, padding: "11px 12px 11px 14px", background: "var(--green-soft)", border: "1px solid var(--green)" }}>
                <div className="flex shrink-0 items-center justify-center" style={{ width: 34, height: 34, background: "var(--green)" }}>
                  <Icon name="check" size={18} color="var(--canvas)" strokeWidth={2.6} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="uppercase font-extrabold" style={{ fontSize: 13, color: "var(--fg)", letterSpacing: 0.5 }}>Asistencia de hoy</div>
                  <div style={{ fontSize: 11, color: "var(--green)", marginTop: 2, letterSpacing: 0.3 }}>
                    Registrada a las <Tnum style={{ fontWeight: 700 }}>{asistHoy}</Tnum>
                  </div>
                </div>
                <button onClick={quitar} className="flex shrink-0 items-center uppercase font-extrabold" style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--muted)", fontSize: 10.5, letterSpacing: 1, gap: 5, padding: "6px 4px" }}>
                  <Icon name="close" size={13} color="var(--muted)" />
                  Deshacer
                </button>
              </div>
              <div style={{ marginTop: 8 }}>
                <Button variant="secondary" full onClick={() => router.push("/vender")}>RENOVAR</Button>
              </div>
            </>
          ) : (
            <div className="flex" style={{ gap: 8 }}>
              <Button variant="primary" full icon="check" onClick={marcar}>ASISTENCIA</Button>
              <Button variant="secondary" full onClick={() => router.push("/vender")}>RENOVAR</Button>
            </div>
          )}
        </div>

        {/* WhatsApp */}
        <div style={{ padding: "10px 16px 0" }}>
          <button onClick={mensaje} className="flex w-full items-center" style={{ padding: "12px 14px", background: "transparent", border: "1px solid var(--silver-dim)", color: "var(--fg)", cursor: "pointer", gap: 10 }}>
            <Icon name="wa" size={16} color="#25d366" />
            <span className="uppercase font-bold" style={{ fontSize: 12, letterSpacing: 0.8, flex: 1, textAlign: "left" }}>Mandar mensaje</span>
            <Icon name="arrow" size={14} color="var(--muted)" />
          </button>
        </div>

        {/* Historial */}
        <SectionHeader trailing={`${c.asistEsteMes + (asistHoy ? 1 : 0)} ASIST.`}>HISTORIAL · MAYO</SectionHeader>
        {[...(asistHoy ? [{ d: "HOY", t: asistHoy, tag: "Funcional", today: true }] : []), ...HISTORIAL.map((h) => ({ ...h, today: false }))].map((row, i) => (
          <div
            key={i}
            className="grid items-center"
            style={{ gridTemplateColumns: "8px 70px 1fr auto", gap: 14, padding: "12px 22px", borderTop: i === 0 ? "1px solid var(--line)" : "none", borderBottom: "1px solid var(--line)", background: row.today ? "var(--green-soft)" : "transparent" }}
          >
            <span style={{ width: 6, height: 6, borderRadius: 999, background: row.today ? "var(--green)" : "var(--yellow)" }} />
            <Tnum className="uppercase" style={{ fontWeight: row.today ? 800 : 600, fontSize: 13, color: row.today ? "var(--green)" : "var(--fg)", letterSpacing: 0.4 }}>{row.d}</Tnum>
            <span style={{ fontSize: 11.5, color: "var(--muted)", letterSpacing: 0.4 }}>{row.tag}</span>
            <Tnum style={{ fontSize: 12, color: row.today ? "var(--green)" : "var(--muted)" }}>{row.t}</Tnum>
          </div>
        ))}

        {/* Pagos */}
        <SectionHeader trailing="3 VENTAS">HISTORIAL DE PAGOS</SectionHeader>
        {PAGOS.map((row, i) => (
          <div key={i} className="flex items-center justify-between" style={{ gap: 12, padding: "13px 22px", borderTop: i === 0 ? "1px solid var(--line)" : "none", borderBottom: "1px solid var(--line)" }}>
            <div>
              <div className="uppercase font-semibold" style={{ fontSize: 13, color: "var(--fg)", letterSpacing: 0.3 }}>{row.p}</div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                <Tnum>{row.d}</Tnum> · {row.met}
              </div>
            </div>
            <Tnum className="font-extrabold" style={{ fontSize: 16 }}>{row.m}</Tnum>
          </div>
        ))}

        <div style={{ height: 28 }} />
      </div>
    </div>
  );
}
