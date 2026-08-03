"use client";

import * as React from "react";
import { CountUp } from "@gym/ui/forge/count-up";
import { Icon, type IconName } from "@gym/ui/forge/icon";
import { Avatar, Button, Card, Eyebrow, H1, SectionHeader, Tnum } from "@gym/ui/forge/ui";
import { resumirRoster } from "@gym/domain/rules";
import { fmtEyebrow } from "@gym/format";
import type { RosterClient } from "../../_fixtures";
import { Nota } from "./nota";

// THROWAWAY — variant C, screen 1. See ../page.tsx for the doctrine.
//
// The fixture is anchored at 2026-08-02 (see _fixtures.ts), so the greeting is
// too. Every number on this screen is derived from that one roster array; none
// of it is typed in by hand.
const HOY = new Date(2026, 7, 2);

// The pre-expiry window. 7 = `urgenciaCliente`'s existing `urgente` band, which
// #184 measured at 3/3 = 100% precision — the perfect classifier the real page
// renders at 1.84:1 contrast. #181 C5: every vendor in the set names a
// "próximas renovaciones" window (14d CrossHero, 15d Fitco, 5d Connect Gym);
// this is that window, and it is the ONLY thing on this screen that decays.
const VENCE_PRONTO_DIAS = 7;

// The absence window, and the ONLY place absence is allowed to speak (#185):
// on already-expired members an absence flag fires LATER than the red row at
// every threshold ≥7d (0/13 earlier at 30d). Its whole value is the member
// whose money is already collected and whose window is being wasted — 2 of 21
// live at forge, 1 at 21 days.
const AUSENTE_DIAS = 14;

// How many rows each arm paints before the block admits it is a list, not a
// glance. Capped PER ARM, not on the total: arm B is the signal today's page
// misses entirely, so letting a long arm A swallow it at 500 members would
// re-create the bug this variant exists to fix.
const TOPE_A = 5;
const TOPE_B = 3;

function pluralDias(n: number) {
  return n === 1 ? "1 día" : `${n} días`;
}

export function InicioC({ clientes, n }: { clientes: RosterClient[]; n: number }) {
  const [verTodo, setVerTodo] = React.useState(false);

  const directorio = (q?: string) =>
    `/proto/c-inicio/directorio?n=${n}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  const { vigentes, totalActivos } = resumirRoster(clientes.map((c) => c.estado));

  // ── The queue. Two arms, both scoped to people who still HAVE a package —
  //    #181 C4: "days since expiry" and "days since visit" are two different
  //    questions and no vendor merges them into one ordering. Arm B is what
  //    TeamUp means by an *active* member who is `Slipping Away`. ──
  const conPaquete = clientes.filter((c) => c.estado !== "sin_clases");
  const porVencer = conPaquete
    .filter((c) => c.diasRest <= VENCE_PRONTO_DIAS)
    .toSorted((a, b) => a.diasRest - b.diasRest);
  const derivando = conPaquete
    .filter((c) => c.diasRest > VENCE_PRONTO_DIAS && c.diasSinVenir !== null && c.diasSinVenir >= AUSENTE_DIAS)
    .toSorted((a, b) => (b.diasSinVenir ?? 0) - (a.diasSinVenir ?? 0));

  const cola = porVencer.length + derivando.length;
  const vencidos = clientes.filter((c) => c.diasRest < 0).length;

  const verPorVencer = verTodo ? porVencer : porVencer.slice(0, TOPE_A);
  const verDerivando = verTodo ? derivando : derivando.slice(0, TOPE_B);
  const ocultos = cola - verPorVencer.length - verDerivando.length;

  // Scenery, derived from the same rows: today's attendance = whoever last
  // visited 0 days ago; the sparkline is that same count for the last 7 days.
  const asistenciasHoy = clientes.filter((c) => c.diasSinVenir === 0).length;
  const semana = [6, 5, 4, 3, 2, 1, 0].map(
    (d) => clientes.filter((c) => c.diasSinVenir === d).length,
  );
  const maxSpark = Math.max(1, ...semana);
  const recientes = clientes.filter((c) => c.diasSinVenir === 0).slice(0, 4);

  return (
    <div>
      {/* Brand row — the real screen renders the resolved marca's lockup here. */}
      <div className="flex items-center justify-between" style={{ padding: "14px 22px 16px" }}>
        <div className="uppercase font-extrabold" style={{ fontSize: 12, letterSpacing: 3, color: "var(--fg)" }}>
          RED
        </div>
        <div
          className="flex items-center justify-center border border-line bg-surface font-extrabold"
          style={{ width: 36, height: 36, color: "var(--silver)", fontSize: 11, letterSpacing: 0.6 }}
        >
          A
        </div>
      </div>

      {/* Greeting */}
      <div style={{ padding: "0 22px 14px" }}>
        <Eyebrow>{fmtEyebrow(HOY)}</Eyebrow>
        <H1 size={40} style={{ marginTop: 8 }}>
          BUENOS DÍAS,
          <br />
          <span style={{ color: "var(--gold)" }}>COACH.</span>
        </H1>
      </div>

      {/* ══ NECESITAN ATENCIÓN — the whole variant ══
          Placed ABOVE the asistencias hero on purpose: it is the only thing on
          this screen that gets worse if it is ignored today. That is a real
          cost — it demotes the number the owner opens the app for — and the
          nota at the bottom says so. */}
      <div style={{ padding: "0 16px" }}>
        <div style={{ border: "1px solid var(--line)", background: "var(--surface)" }}>
          <div
            className="flex items-center justify-between"
            style={{ padding: "13px 16px 12px", borderBottom: "1px solid var(--line)", gap: 10 }}
          >
            <div className="flex items-center" style={{ gap: 9 }}>
              <Icon name="alert" size={15} color="var(--warning)" />
              <Eyebrow color="var(--warning)">NECESITAN ATENCIÓN</Eyebrow>
            </div>
            <Tnum className="font-extrabold" style={{ fontSize: 22, lineHeight: 1, color: "var(--warning)" }}>
              {cola}
            </Tnum>
          </div>

          {cola === 0 && (
            <div style={{ padding: "26px 18px", textAlign: "center" }}>
              <Icon name="check" size={22} color="var(--green)" />
              <div className="uppercase font-extrabold" style={{ fontSize: 12.5, color: "var(--fg)", marginTop: 10, letterSpacing: 0.5 }}>
                Nadie por hoy
              </div>
            </div>
          )}

          {/* Arm A — the package runs out this week. */}
          {verPorVencer.length > 0 && (
            <>
              <SubHeader label="VENCE ESTA SEMANA" n={porVencer.length} />
              {verPorVencer.map((c) => (
                <FilaAtencion
                  key={c.id}
                  href={directorio(c.nombre)}
                  inicial={c.inicial}
                  nombre={c.nombre}
                  sub={`${c.paquete}${c.tel ? ` · ${c.tel}` : ""}`}
                  metrica={c.diasRest <= 0 ? "HOY" : String(c.diasRest)}
                  metricaSub={c.diasRest <= 0 ? "vence" : c.diasRest === 1 ? "día" : "días"}
                  acento="var(--warning)"
                  barra
                />
              ))}
            </>
          )}

          {/* Arm B — paid up, but the window is being wasted. Deliberately
              QUIETER than arm A: #185 says this population is 2 of 21 and
              "must be a quiet marker on the active roster, not a section", and
              its backtest is n=3. Rendering it as loud as arm A would repeat
              exactly the mistake #184 measured on the red. */}
          {verDerivando.length > 0 && (
            <>
              <SubHeader label="PAGADOS, PERO NO VIENEN" n={derivando.length} />
              {verDerivando.map((c) => (
                <FilaAtencion
                  key={c.id}
                  href={directorio(c.nombre)}
                  inicial={c.inicial}
                  nombre={c.nombre}
                  sub={`le quedan ${pluralDias(c.diasRest)} pagados`}
                  metrica={String(c.diasSinVenir)}
                  metricaSub="sin venir"
                  acento="var(--muted)"
                />
              ))}
            </>
          )}

          {ocultos > 0 && (
            <button
              onClick={() => setVerTodo(true)}
              className="forge-pressable flex w-full items-center justify-center uppercase font-bold"
              style={{
                padding: "13px 16px",
                background: "transparent",
                border: "none",
                borderTop: "1px solid var(--line)",
                // --fg, not --gold: this is a control, and RED's --gold is the
                // 1.84:1 token #184 caught hiding the one perfect classifier.
                // --warning is reserved for the signal itself, never for chrome.
                color: "var(--fg)",
                fontSize: 11,
                letterSpacing: 1,
                cursor: "pointer",
              }}
            >
              Ver las otras {ocultos}
            </button>
          )}

          {/* The 13 the real page shouts about, named once and sent away.
              #185: 0 of them did anything between last visit and expiry, 0
              renewed late by 8+ days, 0 came back. #182: win-back is
              unsupported — 38% return on their own. */}
          <div
            style={{
              padding: "11px 16px 12px",
              borderTop: "1px solid var(--line)",
              background: "var(--sunk)",
              fontSize: 11,
              color: "var(--muted)",
              lineHeight: 1.5,
            }}
          >
            <Tnum style={{ color: "var(--fg)", fontWeight: 700 }}>{vencidos}</Tnum> vencidos no aparecen
            aquí: ninguno volvió ni renovó tarde.{" "}
            <a href={directorio()} style={{ color: "var(--gold)", fontWeight: 700, textDecoration: "none" }}>
              Están en el directorio →
            </a>
          </div>
        </div>
      </div>

      {/* ── From here down: the real INICIO, unchanged in shape. ── */}

      <Card glow style={{ margin: "12px 16px 0" }}>
        <div className="flex items-start justify-between">
          <Eyebrow>ASISTENCIAS · HOY</Eyebrow>
        </div>
        <div className="flex items-end" style={{ gap: 10, marginTop: 8 }}>
          <CountUp
            value={asistenciasHoy}
            className="font-extrabold"
            style={{ fontSize: 76, lineHeight: 0.85, letterSpacing: -2.5, color: "var(--fg)" }}
          />
          <span style={{ fontSize: 13, color: "var(--muted)", paddingBottom: 10 }}>de pase registrado</span>
        </div>
        <div className="flex items-end" style={{ gap: 4, marginTop: 16, height: 30 }}>
          {semana.map((v, i) => (
            <div
              key={i}
              className="flex-1"
              style={{
                height: `${Math.max(6, (v / maxSpark) * 100)}%`,
                background: i === semana.length - 1 ? "var(--yellow)" : "var(--muted-soft)",
              }}
            />
          ))}
        </div>
        <div className="flex justify-between" style={{ marginTop: 8, fontSize: 10, color: "var(--muted)", letterSpacing: 1 }}>
          <span>7 DÍAS ATRÁS</span>
          <span>HOY</span>
        </div>
      </Card>

      <div className="grid grid-cols-2" style={{ padding: "10px 16px 0", gap: 8 }}>
        <Card style={{ padding: "14px 16px" }}>
          <Eyebrow>VIGENTES</Eyebrow>
          <div className="flex items-baseline" style={{ gap: 4, marginTop: 4 }}>
            <Tnum className="font-extrabold" style={{ fontSize: 28, lineHeight: 1 }}>{vigentes}</Tnum>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>/ {totalActivos}</span>
          </div>
        </Card>
        <Card style={{ padding: "14px 16px" }}>
          <Eyebrow>SEMANA · ASISTENCIAS</Eyebrow>
          <Tnum className="font-extrabold" style={{ display: "block", marginTop: 4, fontSize: 28, lineHeight: 1 }}>
            {semana.reduce((a, b) => a + b, 0)}
          </Tnum>
        </Card>
      </div>

      <div style={{ padding: "16px 16px 0" }}>
        <Button variant="primary" size="lg" full iconRight="arrow">
          PASE DE LISTA
        </Button>
      </div>

      {/* Quick actions. The real screen's first tile is "POR VENCER · Revisar
          roster" — under Option C that job moved up into the block above, so
          the tile becomes what CLIENTES now is: a place to look someone up. */}
      <div className="grid grid-cols-2" style={{ padding: "20px 16px 0", gap: 8 }}>
        <QuickAction icon="search" label="DIRECTORIO" sub="Buscar a alguien" href={directorio()} />
        <QuickAction icon="user" label="NUEVO CLIENTE" sub="Registrar venta" />
      </div>

      <SectionHeader trailing="HOY">ÚLTIMAS ASISTENCIAS</SectionHeader>
      <div>
        {recientes.map((c, i) => (
          <div
            key={c.id}
            className="flex w-full items-center"
            style={{
              gap: 14,
              padding: "12px 22px",
              borderTop: i === 0 ? "1px solid var(--line)" : "none",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <Avatar initial={c.inicial} size={38} />
            <div className="min-w-0 flex-1">
              <div className="uppercase font-semibold" style={{ fontSize: 14, color: "var(--fg)", letterSpacing: 0.4 }}>
                {c.nombre}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>{c.paquete}</div>
            </div>
            <div className="flex items-center justify-center" style={{ width: 22, height: 22, background: "var(--green-soft)" }}>
              <Icon name="check" size={12} color="var(--green)" />
            </div>
          </div>
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

      <Nota
        lines={[
          <>
            La cola de trabajo vive <b style={{ color: "var(--fg)" }}>aquí</b>, no en CLIENTES. Son{" "}
            <b style={{ color: "var(--fg)" }}>{cola}</b> personas de {clientes.length} — las que vencen esta
            semana, más quien pagó y dejó de venir. Es el patrón de mercado: 12 vendedores modelan ausencia,
            cero la usan para ordenar el directorio (#181 C3).
          </>,
          <>
            Un solo acento, <span style={{ color: "var(--warning)", fontWeight: 700 }}>ámbar</span> (7.9:1), y
            solo sobre las {porVencer.length} que vencen. Hoy el rojo grita en 19 filas y acierta en 1 (5.3%).
            Los {vencidos} vencidos salen del bloque con una línea que dice por qué.
          </>,
          <>
            Puse el bloque <b style={{ color: "var(--fg)" }}>arriba</b> del contador de asistencias. Eso tiene
            precio: el número que abres la app para ver quedó en segundo lugar, todos los días, para 5 filas
            que la mayoría de las semanas serán 2.
          </>,
          <>
            Costo real: si no abres INICIO, nadie te avisa. El directorio ya no te lo va a decir — es la
            apuesta entera de esta variante.
          </>,
          <>
            A 500 socios este bloque trae ~{Math.round((cola / clientes.length) * 500)} filas. Toca “ver las
            otras” y deja de ser un vistazo: vuelve a ser una lista, dentro del tablero. Cada fila abre el
            directorio con el nombre ya buscado (en producción abriría COBRAR).
          </>,
        ]}
      />

      <div style={{ height: 24 }} />
    </div>
  );
}

function SubHeader({ label, n }: { label: string; n: number }) {
  return (
    <div
      className="flex items-center justify-between"
      style={{ padding: "12px 16px 6px", gap: 8 }}
    >
      <Eyebrow style={{ fontSize: 9.5 }}>{label}</Eyebrow>
      <Tnum style={{ fontSize: 10.5, color: "var(--muted)", fontWeight: 700 }}>{n}</Tnum>
    </div>
  );
}

function FilaAtencion({
  href,
  inicial,
  nombre,
  sub,
  metrica,
  metricaSub,
  acento,
  barra = false,
}: {
  href: string;
  inicial: string;
  nombre: string;
  sub: string;
  metrica: string;
  metricaSub: string;
  acento: string;
  barra?: boolean;
}) {
  return (
    <a
      href={href}
      className="forge-pressable relative flex w-full items-center"
      style={{
        gap: 12,
        padding: "11px 16px 11px 16px",
        borderTop: "1px solid var(--line)",
        textDecoration: "none",
      }}
    >
      {barra && <span className="absolute" style={{ left: 0, top: 0, bottom: 0, width: 3, background: acento }} />}
      <Avatar initial={inicial} size={36} />
      <div className="min-w-0 flex-1">
        <div className="uppercase font-semibold" style={{ fontSize: 13.5, color: "var(--fg)", letterSpacing: 0.4 }}>
          {nombre}
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>{sub}</div>
      </div>
      <div className="shrink-0" style={{ textAlign: "right", minWidth: 58 }}>
        <Tnum className="font-extrabold" style={{ fontSize: 17, lineHeight: 1, color: acento }}>{metrica}</Tnum>
        <div style={{ fontSize: 9.5, color: "var(--muted)", marginTop: 3, letterSpacing: 0.3, whiteSpace: "nowrap" }}>
          {metricaSub}
        </div>
      </div>
      <Icon name="chev" size={13} color="var(--muted-soft)" />
    </a>
  );
}

function QuickAction({
  icon,
  label,
  sub,
  href,
}: {
  icon: IconName;
  label: string;
  sub: string;
  href?: string;
}) {
  const inner = (
    <>
      <Icon name={icon} size={22} color="var(--gold)" />
      <div>
        <div className="font-extrabold" style={{ fontSize: 11.5, letterSpacing: 1.2 }}>{label}</div>
        <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 4, letterSpacing: 0.4 }}>{sub}</div>
      </div>
    </>
  );
  const style: React.CSSProperties = { padding: 16, gap: 14, color: "var(--fg)", textDecoration: "none" };
  return href ? (
    <a href={href} className="forge-pressable flex flex-col border border-line bg-surface text-left" style={style}>
      {inner}
    </a>
  ) : (
    <div className="flex flex-col border border-line bg-surface text-left" style={style}>
      {inner}
    </div>
  );
}
