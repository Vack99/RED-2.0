"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CountUp } from "@gym/ui/forge/count-up";
import { Icon, type IconName } from "@gym/ui/forge/icon";
import { Avatar, Button, Card, Eyebrow, H1, SectionHeader, Tnum } from "@gym/ui/forge/ui";
import { CUBO_LABEL, CUBO_ORDEN, RENOVACION_CLASES, RENOVACION_DIAS, type CuboRenovar } from "@gym/domain/lifecycle";
import type { ResumenMes } from "@gym/domain/types";
import type { AsistenciaHoy } from "@gym/data/server/asistencia";
import { pesos } from "@gym/format";
import { markInAppNav } from "../../../../lib/nav";

const SPARK_FLOOR = 0.06;

interface InicioScreenProps {
  resumen: ResumenMes;
  vigentes: number;
  /** The whole roster — the "/ N" denominator (#225: never a narrower "activos" subset). */
  total: number;
  /** Auth-linked (Door 2) members with no active package — the online funnel the
   *  owner would otherwise miss without scrolling the directory (audit #11). */
  nuevosOnline: number;
  /** POR RENOVAR's count + day/clases buckets (#228) — the SAME `esPorRenovar`/
   *  `contarLifecycle` predicate the directory's filter/count and the pase de lista
   *  badge read, computed once by `getRosterResumen` (no second roster fetch). */
  porRenovar: { total: number; cubos: Record<CuboRenovar, number> };
  recientes: AsistenciaHoy[];
  /** Pre-formatted greeting eyebrow (carries the year), built server-side via fmtEyebrow. */
  eyebrow: string;
  /** The resolved marca's lockup, rendered server-side (grill lock (g)). */
  lockup: React.ReactNode;
}

export function InicioScreen({
  resumen,
  vigentes,
  total,
  nuevosOnline,
  porRenovar,
  recientes,
  eyebrow,
  lockup,
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

  // Sparkline bars start at the floor and grow to their real height on mount
  // (the CSS scaleY transition needs a from-state). The flip is deferred a
  // frame via rAF so the floor paints first; under reduced motion the global
  // CSS block neutralizes the transition, so the bars simply appear at height.
  const [sparkGrown, setSparkGrown] = React.useState(false);
  React.useEffect(() => {
    const raf = requestAnimationFrame(() => setSparkGrown(true));
    return () => cancelAnimationFrame(raf);
  }, []);

  return (
    <div>
      {/* Brand row */}
      <div className="flex items-center justify-between" style={{ padding: "14px 22px 16px" }}>
        {lockup}
        <button
          onClick={() => router.push("/cuenta")}
          className="forge-hit forge-pressable border border-line bg-surface font-extrabold"
          style={{ width: 36, height: 36, padding: 0, color: "var(--silver)", fontSize: 11, letterSpacing: 0.6, cursor: "pointer" }}
        >
          D
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
            // GPU-composited: scaleY from the bottom (transform, not animated
            // height) so the bars grow identically without triggering layout.
            // Seeded at the floor for one frame, then flipped to the real scale
            // so the CSS transition animates the growth in.
            <div
              key={i}
              className="flex-1"
              style={{
                height: "100%",
                transform: `scaleY(${sparkGrown ? Math.max(SPARK_FLOOR, v / maxSpark) : SPARK_FLOOR})`,
                transformOrigin: "bottom",
                transition: "transform 300ms cubic-bezier(.32,.72,0,1)",
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
            <span style={{ fontSize: 12, color: "var(--muted)" }}>/ {total}</span>
          </div>
        </Card>
        <Card style={{ padding: "14px 16px" }}>
          <Eyebrow>SEMANA · INGRESOS</Eyebrow>
          <Tnum className="font-extrabold" style={{ display: "block", marginTop: 4, fontSize: 22, lineHeight: 1, letterSpacing: -0.4 }}>
            {pesos(ingresosSemana)}
          </Tnum>
        </Card>
      </div>

      {/* Nuevos registros online — the Door-2 funnel tile (audit #11). Taps
          through to the roster with the "Registrados online" filter applied. */}
      <div style={{ padding: "10px 16px 0" }}>
        <button
          onClick={() => router.push("/clientes?online=1")}
          className="forge-pressable flex w-full items-center border border-line bg-surface text-left"
          style={{ padding: "14px 16px", gap: 14, cursor: "pointer", color: "var(--fg)" }}
        >
          <div className="flex shrink-0 items-center justify-center" style={{ width: 34, height: 34, background: nuevosOnline > 0 ? "var(--green-soft)" : "var(--sunk)" }}>
            <Icon name="user" size={17} color={nuevosOnline > 0 ? "var(--green)" : "var(--muted)"} />
          </div>
          <div className="min-w-0 flex-1">
            <Eyebrow>NUEVOS REGISTROS ONLINE</Eyebrow>
            <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 3, letterSpacing: 0.3 }}>
              {nuevosOnline > 0 ? "Cóbrales en mostrador como EXISTENTE" : "Sin registros nuevos"}
            </div>
          </div>
          <Tnum className="font-extrabold" style={{ fontSize: 26, lineHeight: 1, color: nuevosOnline > 0 ? "var(--green)" : "var(--muted-soft)" }}>{nuevosOnline}</Tnum>
          <Icon name="chev" size={14} color="var(--muted)" />
        </button>
      </div>

      {/* Big CTA */}
      <div style={{ padding: "16px 16px 0" }}>
        <Button variant="primary" size="lg" full iconRight="arrow" onClick={() => router.push("/asistencia")}>
          PASE DE LISTA
        </Button>
      </div>

      {/* Quick actions — POR VENCER is gone (#228): two names for one intent may not
          coexist on one screen, and the POR RENOVAR tile below replaces it. */}
      <div style={{ padding: "20px 16px 0" }}>
        <QuickAction icon="user" label="NUEVO CLIENTE" sub="Registrar venta" onClick={() => router.push("/vender")} />
      </div>

      {/* MEMBRESÍAS — the tile that replaces the old POR VENCER quick action
          (#228), under the section header the proto reference settled on (#229's
          AÚN A TIEMPO joins here later). Count + day/clases buckets from the SAME
          contarLifecycle/esPorRenovar predicate the directory's filter/count
          share, so the tile and `/clientes?renovar=1` can never disagree. Zero
          count renders calm "todo al día" copy and does not deep-link (spec
          story 18). */}
      <SectionHeader trailing={`${total} SOCIOS`}>MEMBRESÍAS</SectionHeader>
      <div style={{ padding: "0 16px" }}>
        <RenovarTile
          total={porRenovar.total}
          cubos={porRenovar.cubos}
          onVerTodos={() => router.push("/clientes?renovar=1")}
        />
      </div>

      {/* Recent activity — today's real asistencias, ordered by time */}
      <SectionHeader trailing="HOY">ÚLTIMAS ASISTENCIAS</SectionHeader>
      <div>
        {recientes.map((row, i) => (
          <Link
            key={`${row.cliente_id}-${i}`}
            href={`/clientes/${row.cliente_id}`}
            // Arm the in-app breadcrumb so the ficha back returns here (see lib/nav).
            onClick={markInAppNav}
            // Default 'auto' prefetch (not explicit full): same ~7-call ficha
            // route as the roster; loading.tsx covers the swap. (See clientes.tsx.)
            className="forge-pressable flex w-full items-center text-left"
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
          </Link>
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
      className="forge-pressable flex flex-col border border-line bg-surface text-left"
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

/** The POR RENOVAR tile (#228) — count + day/clases buckets, matching the walked
 *  SHAPE the /proto/e-ventana reference tile settled on (header row → bucket grid
 *  → CTA footer). Reference only: `total`/`cubos` arrive already computed
 *  server-side (contarLifecycle) — no threshold lives here. Count-only + buckets,
 *  no member names, so spec story 22's "cap past ~15 rows" concern doesn't apply.
 *
 *  Color (#228 opus review F1 — BLOCKER): `--warning`/`--warning-soft`, the SAME
 *  pair the proto reference used, NOT `--yellow`/`--gold` — on RED's live tokens
 *  gold-on-surface is a 1.74:1 contrast ratio (illegible); `--warning` holds
 *  7.5:1 on every brand module (forge/red/base all define it as an accessible
 *  amber, `packages/brand/src/*\/tokens.ts`). */
function RenovarTile({
  total,
  cubos,
  onVerTodos,
}: {
  total: number;
  cubos: Record<CuboRenovar, number>;
  onVerTodos: () => void;
}) {
  const accent = total > 0 ? "var(--warning)" : "var(--muted)";
  return (
    <div style={{ border: "1px solid var(--line)", background: "var(--surface)" }}>
      <div
        className="flex items-center"
        style={{ gap: 10, padding: "13px 16px 12px", borderBottom: total > 0 ? "1px solid var(--line)" : "none" }}
      >
        <Icon name="flame" size={15} color={accent} />
        <div className="min-w-0 flex-1">
          <Eyebrow color={accent}>POR RENOVAR</Eyebrow>
          <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 3, lineHeight: 1.4 }}>
            {total > 0
              ? `Vencen en ${RENOVACION_DIAS} días o menos, o les queda ${RENOVACION_CLASES} clase o menos`
              : "Nadie vence pronto"}
          </div>
        </div>
        <Tnum className="font-extrabold" style={{ fontSize: 26, lineHeight: 1, color: accent }}>{total}</Tnum>
      </div>

      {total === 0 ? (
        // Zero count: calm "todo al día" copy, never search-shaped "no results" —
        // and, deliberately, no link/onClick anywhere in this branch (#228 AC).
        <div className="flex items-center" style={{ gap: 10, padding: "14px 16px" }}>
          <Icon name="check" size={16} color="var(--muted-soft)" />
          <div style={{ fontSize: 11.5, color: "var(--muted)" }}>Todo al día — nadie por renovar.</div>
        </div>
      ) : (
        <>
          <div style={{ padding: "12px 16px 14px" }}>
            <div className="grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 4 }}>
              {CUBO_ORDEN.map((key) => {
                const n = cubos[key];
                return (
                  <div
                    key={key}
                    className="flex flex-col items-center"
                    style={{
                      padding: "9px 2px",
                      background: n > 0 ? "var(--warning-soft)" : "var(--sunk)",
                      border: `1px solid ${n > 0 ? "var(--warning)" : "var(--line)"}`,
                      gap: 3,
                    }}
                  >
                    <Tnum
                      className="font-extrabold"
                      style={{ fontSize: 17, lineHeight: 1, color: n > 0 ? "var(--warning)" : "var(--muted-soft)" }}
                    >
                      {n}
                    </Tnum>
                    <span
                      className="uppercase font-bold"
                      style={{ fontSize: 8, letterSpacing: 0.6, color: "var(--muted)", whiteSpace: "nowrap" }}
                    >
                      {CUBO_LABEL[key]}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
          {/* Deep link (#228 AC): lands on /clientes?renovar=1 — the same rows the
              count promised (same esPorRenovar predicate, same pase-suelto blinding). */}
          <button
            onClick={onVerTodos}
            className="forge-pressable flex w-full items-center justify-center uppercase font-bold"
            style={{
              gap: 7,
              padding: "12px 16px",
              borderTop: "1px solid var(--line)",
              background: "transparent",
              color: "var(--fg)",
              fontSize: 10.5,
              letterSpacing: 1,
              cursor: "pointer",
            }}
          >
            {total === 1 ? "Ver el 1 en el directorio" : `Ver los ${total} en el directorio`}
            <Icon name="arrow" size={13} color="var(--fg)" />
          </button>
        </>
      )}
    </div>
  );
}
