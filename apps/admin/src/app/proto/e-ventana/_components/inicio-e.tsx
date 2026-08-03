"use client";

// apps/admin/src/app/proto/e-ventana/_components/inicio-e.tsx — THROWAWAY (see
// ../inicio/page.tsx). VARIANT E, screen 2 of 2: Fitco's two bounded tiles,
// dropped into a mirror of the REAL apps/admin/src/app/(app)/inicio.
//
// Everything above the tiles is the real screen's own furniture — brand row,
// greeting, ASISTENCIAS hero + sparkline, the stat pair, PASE DE LISTA, the
// quick actions — reproduced so the tiles are judged where they would actually
// live, not on a blank page. The tiles sit LOW, in the slot ÚLTIMAS
// ASISTENCIAS occupies today (owner's explicit placement), and the attendance
// feed still renders beneath them: this variant does not take the hero.
//
// The two tiles are Fitco's, including the number that makes them work:
//
//   PRÓXIMAS RENOVACIONES  memberships expiring within 15 days, plus anyone
//                          with 1 session left. Counted into Connect Gym's
//                          observed buckets (hoy / mañana / 3 días / 5 días).
//   CLIENTES POR RECUPERAR two arms — expired by DATE days 1–15, and SESSIONS
//                          ran out days 1–15 — and the rule that bounds it:
//                          «Después de 16 días, los clientes ya no aparecen».
//
// That cutoff is the whole variant. The −44-día rows are not sorted, tiered or
// folded: they age out of the actionable surface entirely and stay reachable
// only by search. The tile says how many that is, out loud.

import * as React from "react";
import { CountUp } from "@gym/ui/forge/count-up";
import { Icon, type IconName } from "@gym/ui/forge/icon";
import { Avatar, Button, Card, Eyebrow, H1, SectionHeader, Tnum } from "@gym/ui/forge/ui";
import { resumirRoster } from "@gym/domain/rules";
import { fmtEyebrow } from "@gym/format";
import type { RosterClient } from "../../_fixtures";
import { CUBOS, RECUPERAR_DIAS, RENOVACION_DIAS, derivar } from "./lifecycle";
import { Nota } from "./nota";

// The fixture is anchored at 2026-08-02 (see _fixtures.ts), so the greeting is
// too. Every number on this screen is derived from that one roster array.
const HOY = new Date(2026, 7, 2);

export function InicioE({ clientes, n }: { clientes: RosterClient[]; n: number }) {
  const filas = React.useMemo(() => clientes.map(derivar), [clientes]);

  const dir = (f?: "renovar" | "aTiempo") =>
    `/proto/e-ventana?n=${n}${f ? `&f=${f === "aTiempo" ? "atiempo" : f}` : ""}`;

  const { vigentes, totalActivos } = resumirRoster(clientes.map((c) => c.estado));

  // ── Tile 1 ──
  const renovar = filas.filter((f) => f.renovar);
  const cubos = CUBOS.map((cu) => ({
    l: cu.l,
    n: renovar.filter((f) => cu.test(f.c.diasRest)).length,
  }));

  // ── Tile 2 — two arms, kept apart on purpose (#181 C4: nobody merges the
  //    two clocks into one ordering; `urgenciaCliente` is the thing that does). ──
  const recuperar = filas.filter((f) => f.aTiempo);
  const porFecha = recuperar.filter((f) => f.eje === "fecha").length;
  const porClases = recuperar.filter((f) => f.eje === "clases").length;
  const fuera = filas.filter((f) => f.fueraDeAlcance).length;

  // Scenery, derived from the same rows.
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
        <div
          className="uppercase font-extrabold"
          style={{ fontSize: 12, letterSpacing: 3, color: "var(--fg)" }}
        >
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

      {/* Hero — untouched. The tiles below do NOT compete with it. */}
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
          <span style={{ fontSize: 13, color: "var(--muted)", paddingBottom: 10 }}>
            de pase registrado
          </span>
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
        <div
          className="flex justify-between"
          style={{ marginTop: 8, fontSize: 10, color: "var(--muted)", letterSpacing: 1 }}
        >
          <span>7 DÍAS ATRÁS</span>
          <span>HOY</span>
        </div>
      </Card>

      <div className="grid grid-cols-2" style={{ padding: "10px 16px 0", gap: 8 }}>
        <Card style={{ padding: "14px 16px" }}>
          <Eyebrow>VIGENTES</Eyebrow>
          <div className="flex items-baseline" style={{ gap: 4, marginTop: 4 }}>
            <Tnum className="font-extrabold" style={{ fontSize: 28, lineHeight: 1 }}>
              {vigentes}
            </Tnum>
            <span style={{ fontSize: 12, color: "var(--muted)" }}>/ {totalActivos}</span>
          </div>
        </Card>
        <Card style={{ padding: "14px 16px" }}>
          <Eyebrow>SEMANA · ASISTENCIAS</Eyebrow>
          <Tnum
            className="font-extrabold"
            style={{ display: "block", marginTop: 4, fontSize: 28, lineHeight: 1 }}
          >
            {semana.reduce((a, b) => a + b, 0)}
          </Tnum>
        </Card>
      </div>

      <div style={{ padding: "16px 16px 0" }}>
        <Button variant="primary" size="lg" full iconRight="arrow">
          PASE DE LISTA
        </Button>
      </div>

      <div className="grid grid-cols-2" style={{ padding: "20px 16px 0", gap: 8 }}>
        <QuickAction icon="search" label="DIRECTORIO" sub="Buscar a alguien" href={dir()} />
        <QuickAction icon="user" label="NUEVO CLIENTE" sub="Registrar venta" />
      </div>

      {/* ══ THE TWO TILES — low on the page, in ÚLTIMAS ASISTENCIAS' slot ══ */}

      <SectionHeader trailing={`${clientes.length} SOCIOS`}>MEMBRESÍAS</SectionHeader>

      <div style={{ padding: "0 16px", display: "flex", flexDirection: "column", gap: 10 }}>
        {/* ── Tile 1: POR RENOVAR ── */}
        <Tile
          titulo="POR RENOVAR"
          sub={`Vencen en ${RENOVACION_DIAS} días o menos, o les queda 1 clase`}
          n={renovar.length}
          color="var(--warning)"
          icono="flame"
          href={dir("renovar")}
          cta={`Ver los ${renovar.length} en el directorio`}
        >
          <div className="grid" style={{ gridTemplateColumns: "repeat(5, 1fr)", gap: 4 }}>
            {cubos.map((cu) => (
              <div
                key={cu.l}
                className="flex flex-col items-center"
                style={{
                  padding: "9px 2px",
                  background: cu.n > 0 ? "var(--warning-soft)" : "var(--sunk)",
                  border: `1px solid ${cu.n > 0 ? "var(--warning)" : "var(--line)"}`,
                  gap: 3,
                }}
              >
                <Tnum
                  className="font-extrabold"
                  style={{ fontSize: 17, lineHeight: 1, color: cu.n > 0 ? "var(--warning)" : "var(--muted-soft)" }}
                >
                  {cu.n}
                </Tnum>
                <span
                  className="uppercase font-bold"
                  style={{ fontSize: 8, letterSpacing: 0.6, color: "var(--muted)", whiteSpace: "nowrap" }}
                >
                  {cu.l}
                </span>
              </div>
            ))}
          </div>
        </Tile>

        {/* ── Tile 2: AÚN A TIEMPO — Fitco's sharpest artefact ── */}
        <Tile
          titulo="AÚN A TIEMPO"
          sub={`Se les acabó hace 1–${RECUPERAR_DIAS} días`}
          n={recuperar.length}
          color="var(--fg)"
          icono="refresh"
          href={dir("aTiempo")}
          cta={`Ver los ${recuperar.length} en el directorio`}
        >
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <Arm label="Se les venció la fecha" n={porFecha} />
            <Arm label="Se les acabaron las clases" n={porClases} />
          </div>
          {/* The rule that makes the tile work, and the only honest way to show
              it: name the people it deliberately drops. */}
          <div
            style={{
              marginTop: 12,
              paddingTop: 11,
              borderTop: "1px solid var(--line)",
              fontSize: 10.5,
              color: "var(--muted)",
              lineHeight: 1.55,
            }}
          >
            Esta lista se cierra a los 15 días.{" "}
            <Tnum style={{ color: "var(--fg)", fontWeight: 700 }}>{fuera}</Tnum> de{" "}
            <Tnum style={{ color: "var(--fg)", fontWeight: 700 }}>{clientes.length}</Tnum> ya
            pasaron ese límite y salen de esta pantalla por completo. Siguen en el directorio, sólo
            por búsqueda.
          </div>
        </Tile>
      </div>

      {/* The real screen's tail, still here, still below. */}
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
              <div
                className="uppercase font-semibold"
                style={{ fontSize: 14, color: "var(--fg)", letterSpacing: 0.4 }}
              >
                {c.nombre}
              </div>
              <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>{c.paquete}</div>
            </div>
            <div
              className="flex items-center justify-center"
              style={{ width: 22, height: 22, background: "var(--green-soft)" }}
            >
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
        volver={dir()}
        lines={[
          <>
            <b style={{ color: "var(--fg)" }}>E · VENTANA — dos mosaicos acotados.</b> Sigue la
            familia puramente derivada — una sola lista donde la etiqueta cambia en vez de que el
            cliente se traslade — elegida porque este producto no tiene un botón de «dar de baja»
            declarado del que una pestaña aparte pueda depender (#181 D1): <i>Por Renovar</i> (15
            días, o 1 clase) y <i>Aún a Tiempo</i> (días 1–15, en dos brazos separados: se venció la
            fecha vs se acabaron las clases). Hoy son{" "}
            <Tnum style={{ color: "var(--warning)", fontWeight: 700 }}>{renovar.length}</Tnum> y{" "}
            <Tnum style={{ color: "var(--fg)", fontWeight: 700 }}>{recuperar.length}</Tnum> personas
            — no {clientes.length}, y no las 22 que implica el encabezado de hoy.
          </>,
          <>
            La regla que lo hace funcionar es el corte de 15 días.{" "}
            <Tnum style={{ color: "var(--fg)", fontWeight: 700 }}>{fuera}</Tnum> socios{" "}
            <b style={{ color: "var(--fg)" }}>desaparecen</b> de aquí — no se ordenan más abajo, no
            se pliegan, no se atenúan: dejan de existir para el trabajo del día. Es la única
            variante que <i>acota</i> en vez de <i>ordenar</i>.
          </>,
          <>
            Los mosaicos van <b style={{ color: "var(--fg)" }}>abajo</b>, donde hoy están las
            últimas asistencias, y el contador grande sigue siendo el héroe. Nadie pierde su lugar;
            el tablero sólo gana un pie de página con trabajo concreto, y cada mosaico entra al
            directorio ya filtrado.
          </>,
          <>
            <b style={{ color: "var(--warning)" }}>CUESTA —</b> el corte es de{" "}
            <i>un solo proveedor</i>. #182 midió una curva real (Río, 550–700 socios): el retorno
            acumulado va de 0.22 al mes a 0.38 al año, un acantilado medido en{" "}
            <b style={{ color: "var(--fg)" }}>meses</b>, que no puede ubicar un límite de día. El
            corte de 15 días es tan folclórico como el 30/60/90 — y aquí tira{" "}
            <Tnum style={{ color: "var(--fg)", fontWeight: 700 }}>{fuera}</Tnum> personas basándose
            en él.
          </>,
          <>
            <b style={{ color: "var(--warning)" }}>CUESTA —</b> si no abres INICIO, no ves nada: el
            directorio quedó plano a propósito. Y a 500 socios los mosaicos traen ~
            <Tnum>{Math.round(((renovar.length + recuperar.length) / clientes.length) * 500)}</Tnum>{" "}
            personas entre los dos: el número acotado deja de ser un vistazo y vuelve a ser una
            lista, igual que todos los demás.
          </>,
        ]}
      />

      <div style={{ height: 24 }} />
    </div>
  );
}

function Tile({
  titulo,
  sub,
  n,
  color,
  icono,
  href,
  cta,
  children,
}: {
  titulo: string;
  sub: string;
  n: number;
  color: string;
  icono: IconName;
  href: string;
  cta: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ border: "1px solid var(--line)", background: "var(--surface)" }}>
      <div
        className="flex items-center"
        style={{ gap: 10, padding: "13px 16px 12px", borderBottom: "1px solid var(--line)" }}
      >
        <Icon name={icono} size={15} color={color} />
        <div className="min-w-0 flex-1">
          <Eyebrow color={color}>{titulo}</Eyebrow>
          <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 3, lineHeight: 1.4 }}>
            {sub}
          </div>
        </div>
        <Tnum className="font-extrabold" style={{ fontSize: 26, lineHeight: 1, color }}>
          {n}
        </Tnum>
      </div>

      <div style={{ padding: "12px 16px 14px" }}>{children}</div>

      <a
        href={href}
        className="forge-pressable flex w-full items-center justify-center uppercase font-bold"
        style={{
          gap: 7,
          padding: "12px 16px",
          borderTop: "1px solid var(--line)",
          color: "var(--fg)",
          fontSize: 10.5,
          letterSpacing: 1,
          textDecoration: "none",
        }}
      >
        {cta}
        <Icon name="arrow" size={13} color="var(--fg)" />
      </a>
    </div>
  );
}

function Arm({ label, n }: { label: string; n: number }) {
  return (
    <div className="flex items-center" style={{ gap: 10 }}>
      <span
        style={{ width: 4, height: 4, background: n > 0 ? "var(--muted)" : "var(--muted-soft)", flexShrink: 0 }}
      />
      <span className="min-w-0 flex-1" style={{ fontSize: 11.5, color: "var(--muted)" }}>
        {label}
      </span>
      <Tnum
        className="font-extrabold"
        style={{ fontSize: 15, lineHeight: 1, color: n > 0 ? "var(--fg)" : "var(--muted-soft)" }}
      >
        {n}
      </Tnum>
    </div>
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
        <div className="font-extrabold" style={{ fontSize: 11.5, letterSpacing: 1.2 }}>
          {label}
        </div>
        <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 4, letterSpacing: 0.4 }}>
          {sub}
        </div>
      </div>
    </>
  );
  const style: React.CSSProperties = {
    padding: 16,
    gap: 14,
    color: "var(--fg)",
    textDecoration: "none",
  };
  return href ? (
    <a
      href={href}
      className="forge-pressable flex flex-col border border-line bg-surface text-left"
      style={style}
    >
      {inner}
    </a>
  ) : (
    <div className="flex flex-col border border-line bg-surface text-left" style={style}>
      {inner}
    </div>
  );
}
