"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@gym/ui/forge/icon";
import { MensajePicker } from "@gym/ui/forge/mensaje-picker";
import { forgeToast } from "@gym/ui/forge/toaster";
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
} from "@gym/ui/forge/ui";
import type { ClienteFichaDTO } from "@gym/data/server/clientes";
import { firstName, waLink } from "@gym/format";
import { consumeInAppNav, markInAppNav } from "../../../../../lib/nav";
import { idleSwipe, swipeStep, type SwipeState } from "../../../../../lib/swipe";
import { togglePaseAction } from "../actions";
import { EditarClienteSheet } from "./editar-cliente-sheet";

export function ClienteDetalle({ ficha }: { ficha: ClienteFichaDTO }) {
  const router = useRouter();
  const c = ficha.cliente;

  const [present, setPresent] = React.useState(ficha.presentHoy);
  const [horaHoy, setHoraHoy] = React.useState<string | null>(ficha.horaHoy);
  const [busy, setBusy] = React.useState(false);
  const [editOpen, setEditOpen] = React.useState(false);
  const [msgOpen, setMsgOpen] = React.useState(false);
  const [dx, setDx] = React.useState(0);
  const swipe = React.useRef<SwipeState>(idleSwipe());

  const asistCount = ficha.historial.length + (present ? 1 : 0);

  const toggleAsistencia = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await togglePaseAction({ clienteId: c.id, fecha: ficha.hoyIso });
      setPresent(res.present);
      setHoraHoy(res.hora);
      forgeToast(
        res.present
          ? { tone: "success", title: "Asistencia registrada", body: `${c.nombre}${res.hora ? " · hoy " + res.hora : ""}` }
          : { tone: "warning", title: "Asistencia quitada", body: `Se deshizo el registro de hoy de ${firstName(c.nombre)}.` },
      );
    } catch {
      forgeToast({ tone: "warning", title: "No se pudo registrar", body: "Intenta de nuevo." });
    } finally {
      setBusy(false);
    }
  };

  const mensaje = () => setMsgOpen(true);

  // Swipe-to-prev/next. All the gesture decisions (axis-lock so a vertical
  // scroll never drags the page sideways, engage threshold, OS-back-gesture
  // edge gutter, rubber-band at the roster ends, single-touch guard) live in
  // the pure, tested state machine; this is just the DOM adapter.
  const swipeCtx = () => ({
    viewportWidth: typeof window === "undefined" ? 0 : window.innerWidth,
    hasPrev: !!ficha.vecinos.prevId,
    hasNext: !!ficha.vecinos.nextId,
  });
  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    swipe.current = swipeStep(
      swipe.current,
      { kind: "start", x: t?.clientX ?? 0, y: t?.clientY ?? 0, touchCount: e.touches.length },
      swipeCtx(),
    ).state;
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!swipe.current.active) return;
    const t = e.touches[0];
    const { state } = swipeStep(
      swipe.current,
      { kind: "move", x: t?.clientX ?? 0, y: t?.clientY ?? 0, touchCount: e.touches.length },
      swipeCtx(),
    );
    swipe.current = state;
    setDx(state.dx);
  };
  const onTouchEnd = () => {
    const { state, navigate } = swipeStep(swipe.current, { kind: "end" }, swipeCtx());
    swipe.current = state;
    setDx(0);
    // Swiping to a neighbor is itself an in-app push, so arm the breadcrumb to
    // keep the neighbor's back button landing on the roster (not out of the app).
    if (navigate === "next" && ficha.vecinos.nextId) {
      markInAppNav();
      router.push(`/clientes/${ficha.vecinos.nextId}`);
    } else if (navigate === "prev" && ficha.vecinos.prevId) {
      markInAppNav();
      router.push(`/clientes/${ficha.vecinos.prevId}`);
    }
  };
  const onTouchCancel = () => {
    swipe.current = swipeStep(swipe.current, { kind: "cancel" }, swipeCtx()).state;
    setDx(0);
  };

  const histRows: { dDisplay: string; hora: string | null; today: boolean }[] = [
    ...(present ? [{ dDisplay: "HOY", hora: horaHoy, today: true }] : []),
    ...ficha.historial,
  ];

  return (
    <div>
      <AppBar
        onBack={() => {
          // Go back in history ONLY when we arrived via an in-app push (the
          // breadcrumb the roster/recientes/asistencia links arm on click) —
          // that restores the roster's scroll position and plays a pop. On a
          // deep link / refresh the breadcrumb is absent, so fall back to the
          // roster rather than risk router.back() leaving the app entirely
          // (history.length can't distinguish these — see lib/nav.ts).
          if (consumeInAppNav()) router.back();
          else router.push("/clientes");
        }}
        center="CLIENTE"
        trailing={
          <button
            onClick={() => setEditOpen(true)}
            aria-label="Editar"
            className="flex items-center justify-center border border-line bg-surface"
            style={{ width: 38, height: 38, padding: 0, cursor: "pointer" }}
          >
            <Icon name="edit" size={14} color="var(--muted)" />
          </button>
        }
      />

      <EditarClienteSheet
        open={editOpen}
        onClose={() => setEditOpen(false)}
        cliente={{ id: c.id, nombre: c.nombre, tel: c.tel }}
      />

      <MensajePicker
        open={msgOpen}
        onClose={() => setMsgOpen(false)}
        mensajes={ficha.mensajes}
        onEnviar={(m) => {
          window.open(waLink(c.tel, m.texto), "_blank");
          setMsgOpen(false);
        }}
      />

      <div
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={onTouchCancel}
        style={{ touchAction: "pan-y", transform: `translateX(${dx}px)`, transition: dx === 0 ? "transform 240ms cubic-bezier(.32,.72,0,1)" : "none" }}
      >
        {/* Identity */}
        <div style={{ padding: "20px 22px 10px" }}>
          <div className="flex items-center" style={{ gap: 16 }}>
            <Avatar initial={c.inicial} accent size={68} style={{ fontSize: 24 }} />
            <div className="min-w-0 flex-1">
              <H1 size={24} style={{ letterSpacing: -0.3, lineHeight: 1.05 }}>{c.nombre}</H1>
              <div className="flex flex-wrap items-center" style={{ gap: 8, marginTop: 8, fontSize: 11.5, color: "var(--muted)" }}>
                <Badge state={c.estado} />
                {present && (
                  <span className="inline-flex items-center uppercase font-extrabold" style={{ gap: 5, padding: "4px 8px", background: "var(--green)", color: "var(--canvas)", fontSize: 9.5, letterSpacing: 1.1 }}>
                    <Icon name="check" size={11} color="var(--canvas)" strokeWidth={2.6} />
                    ASISTIÓ HOY{horaHoy ? " · " : ""}{horaHoy && <Tnum style={{ fontWeight: 800 }}>{horaHoy}</Tnum>}
                  </span>
                )}
                <Tnum>{c.tel}</Tnum>
              </div>
            </div>
          </div>
        </div>

        {/* Paquete activo — both gauges deplete from the moment of the last
            purchase: clases by attendance, días by calendar time (ADR-0002).
            A stacked balance has no single-package denominator, so the gauge is
            "how much of your current run is left," not "X of one package." */}
        <Card style={{ margin: "8px 16px 0" }}>
          <Eyebrow>PAQUETE ACTIVO</Eyebrow>
          <H1 size={22} style={{ marginTop: 8 }}>{c.paquete}</H1>

          <div className="flex" style={{ gap: 18, marginTop: 18 }}>
            <div className="flex-1">
              <Eyebrow style={{ fontSize: 10 }}>CLASES RESTANTES</Eyebrow>
              <Tnum className="font-extrabold" style={{ display: "block", fontSize: 32, lineHeight: 1, marginTop: 4 }}>{c.clasesRestLabel}</Tnum>
              {ficha.clasesGauge && (
                <div style={{ height: 4, background: "var(--line-soft)", marginTop: 8, overflow: "hidden" }}>
                  <div style={{ width: "100%", height: "100%", background: "var(--yellow)", transform: `scaleX(${ficha.clasesGauge.fill})`, transformOrigin: "left", transition: "transform 600ms cubic-bezier(.32,.72,0,1)" }} />
                </div>
              )}
              <div className="uppercase" style={{ marginTop: ficha.clasesGauge ? 6 : 8, fontSize: 9.5, letterSpacing: 0.8, color: "var(--muted)" }}>
                {ficha.clasesGauge ? (
                  <>Usadas <Tnum style={{ color: "var(--fg)", fontWeight: 700 }}>{ficha.clasesGauge.usadas}</Tnum></>
                ) : c.clasesRest === "ilimitado" ? (
                  "Ilimitado"
                ) : (
                  "—"
                )}
              </div>
            </div>
            <div className="flex-1">
              <Eyebrow style={{ fontSize: 10 }}>DÍAS RESTANTES</Eyebrow>
              <Tnum className="font-extrabold" style={{ display: "block", fontSize: 32, lineHeight: 1, marginTop: 4, color: c.diasRest <= 5 ? "var(--yellow)" : "var(--fg)" }}>{c.diasRest}</Tnum>
              {ficha.diasGauge && (
                <div style={{ height: 4, background: "var(--line-soft)", marginTop: 8, overflow: "hidden" }}>
                  <div style={{ width: "100%", height: "100%", background: c.diasRest <= 5 ? "var(--yellow)" : "var(--green)", transform: `scaleX(${ficha.diasGauge.fill})`, transformOrigin: "left", transition: "transform 600ms cubic-bezier(.32,.72,0,1)" }} />
                </div>
              )}
              <div className="uppercase" style={{ marginTop: ficha.diasGauge ? 6 : 8, fontSize: 9.5, letterSpacing: 0.8, color: "var(--muted)" }}>
                Vence <Tnum style={{ color: c.diasRest <= 5 ? "var(--gold)" : "var(--fg)", fontWeight: 700 }}>{c.venceDisplay.toUpperCase()}</Tnum>
              </div>
            </div>
          </div>
          <div className="flex justify-between" style={{ marginTop: 16, fontSize: 11.5, color: "var(--muted)" }}>
            <span>COMPRADO <Tnum style={{ color: "var(--fg)" }}>{ficha.compradoDisplay.toUpperCase()}</Tnum></span>
            <span>ALTA <Tnum style={{ color: "var(--fg)" }}>{ficha.altaDisplay.toUpperCase()}</Tnum></span>
          </div>
        </Card>

        {/* Attendance control = today indicator */}
        <div style={{ padding: "14px 16px 0" }}>
          {present ? (
            <>
              <div className="flex items-center" style={{ gap: 12, padding: "11px 12px 11px 14px", background: "var(--green-soft)", border: "1px solid var(--green)" }}>
                <div className="flex shrink-0 items-center justify-center" style={{ width: 34, height: 34, background: "var(--green)" }}>
                  <Icon name="check" size={18} color="var(--canvas)" strokeWidth={2.6} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="uppercase font-extrabold" style={{ fontSize: 13, color: "var(--fg)", letterSpacing: 0.5 }}>Asistencia de hoy</div>
                  <div style={{ fontSize: 11, color: "var(--green)", marginTop: 2, letterSpacing: 0.3 }}>
                    {horaHoy ? <>Registrada a las <Tnum style={{ fontWeight: 700 }}>{horaHoy}</Tnum></> : "Registrada"}
                  </div>
                </div>
                <button onClick={toggleAsistencia} disabled={busy} className="forge-pressable flex shrink-0 items-center uppercase font-extrabold" style={{ background: "transparent", border: "none", cursor: busy ? "default" : "pointer", color: "var(--muted)", fontSize: 10.5, letterSpacing: 1, gap: 5, padding: "6px 4px", minHeight: 44 }}>
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
              <Button variant="primary" full icon="check" disabled={busy} onClick={toggleAsistencia}>ASISTENCIA</Button>
              <Button variant="secondary" full onClick={() => router.push("/vender")}>RENOVAR</Button>
            </div>
          )}
        </div>

        {/* WhatsApp */}
        <div style={{ padding: "10px 16px 0" }}>
          <button onClick={mensaje} className="forge-pressable flex w-full items-center" style={{ padding: "12px 14px", background: "transparent", border: "1px solid var(--silver-dim)", color: "var(--fg)", cursor: "pointer", gap: 10 }}>
            <Icon name="wa" size={16} color="#25d366" />
            <span className="uppercase font-bold" style={{ fontSize: 12, letterSpacing: 0.8, flex: 1, textAlign: "left" }}>Mandar mensaje</span>
            <Icon name="arrow" size={14} color="var(--muted)" />
          </button>
        </div>

        {/* Historial */}
        <SectionHeader trailing={`${asistCount} ASIST.`}>HISTORIAL · ÚLTIMOS 30 DÍAS</SectionHeader>
        {histRows.length === 0 && (
          <div style={{ padding: "20px 22px", fontSize: 12, color: "var(--muted)" }}>Sin asistencias en los últimos 30 días.</div>
        )}
        {histRows.map((row, i) => (
          <div
            key={i}
            className="grid items-center"
            style={{ gridTemplateColumns: "8px 80px 1fr auto", gap: 14, padding: "12px 22px", borderTop: i === 0 ? "1px solid var(--line)" : "none", borderBottom: "1px solid var(--line)", background: row.today ? "var(--green-soft)" : "transparent" }}
          >
            <span style={{ width: 6, height: 6, borderRadius: 999, background: row.today ? "var(--green)" : "var(--yellow)" }} />
            <Tnum className="uppercase" style={{ fontWeight: row.today ? 800 : 600, fontSize: 13, color: row.today ? "var(--green)" : "var(--fg)", letterSpacing: 0.4 }}>{row.dDisplay}</Tnum>
            <span style={{ fontSize: 11.5, color: "var(--muted)", letterSpacing: 0.4 }}>Asistencia</span>
            <Tnum style={{ fontSize: 12, color: row.today ? "var(--green)" : "var(--muted)" }}>{row.hora ?? "—"}</Tnum>
          </div>
        ))}

        {/* Pagos */}
        <SectionHeader trailing={`${ficha.ventasCount} ${ficha.ventasCount === 1 ? "VENTA" : "VENTAS"}`}>HISTORIAL DE PAGOS</SectionHeader>
        {ficha.pagos.length === 0 && (
          <div style={{ padding: "20px 22px", fontSize: 12, color: "var(--muted)" }}>Sin ventas registradas.</div>
        )}
        {ficha.pagos.map((row, i) => (
          <div key={i} className="flex items-center justify-between" style={{ gap: 12, padding: "13px 22px", borderTop: i === 0 ? "1px solid var(--line)" : "none", borderBottom: "1px solid var(--line)" }}>
            <div>
              <div className="uppercase font-semibold" style={{ fontSize: 13, color: "var(--fg)", letterSpacing: 0.3 }}>{row.paquete}</div>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                <Tnum>{row.fechaDisplay}</Tnum> · {row.metodo}
              </div>
            </div>
            <Tnum className="font-extrabold" style={{ fontSize: 16 }}>{row.montoDisplay}</Tnum>
          </div>
        ))}

        <div style={{ height: 28 }} />
      </div>
    </div>
  );
}
