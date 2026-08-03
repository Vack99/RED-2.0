"use client";

// apps/admin/src/app/proto/a-tiers/_components/tiers.tsx — THROWAWAY (see
// ../page.tsx). OPTION A of map #180: one page, three lifecycle tiers.
//
// The whole variant is three predicates and a colour swap:
//
//   VENCIDOS   = estado "sin_clases"  (días < 0 OR a one-off pass spent)
//   POR VENCER = NOT vencido AND urgenciaCliente ∈ {crítico, urgente}
//   AL DÍA     = everything else
//
// POR VENCER is literally `urgenciaCliente` WITH the floor it is missing
// (#184: `dias = -44` and `dias = +2` both return `critico`, 5.3% precision
// at RED / 7.1% at Forge). Adding `estado !== "sin_clases"` in front of it is
// the entire fix — no new threshold engine, no fifth band, no migration.
//
// The colour is `--warning` (#e8902a, 7.9:1), NOT `--gold` (#7e0d10, 1.84:1).
// #184 measured the perfect classifier rendering at 1.84:1 while the useless
// one got the loudest colour on the page; this inverts that. Nothing is red:
// red is never spent on someone who has already left.

import * as React from "react";
import { Icon } from "@gym/ui/forge/icon";
import { Avatar, Badge, Eyebrow, H1, Input, Tnum } from "@gym/ui/forge/ui";
import { urgenciaCliente } from "@gym/domain/rules";
import type { RosterClient } from "../../_fixtures";
import { ProtoShell } from "../../_components/shell";

type Tier = "porVencer" | "alDia" | "vencido";

/** Days without a visit before a PAID-UP row wears the quiet absence marker.
 *  A MARKER only — never a tier, a count, or a sort key (#181: 12 of 12
 *  vendors model attendance recency, ZERO rank the directory on it). 14 is
 *  the threshold #185 measured a live population at (2 of 21). */
const AUSENTE_DIAS = 14;

/** Diacritic-blind name match (#184 defect 1: search finds 0 of 4 Chávez). */
function fold(s: string): string {
  return s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
}

/** Phone match on digits only, so "614 123 45 01" finds 6141234501. */
function digits(s: string): string {
  return s.replace(/\D/g, "");
}

interface Row {
  c: RosterClient;
  tier: Tier;
  ausente: boolean;
}

export function TiersScreen({ clientes }: { clientes: RosterClient[] }) {
  const [query, setQuery] = React.useState("");
  const [abrirVencidos, setAbrirVencidos] = React.useState(false);

  const rows: Row[] = React.useMemo(
    () =>
      clientes.map((c) => {
        const u = urgenciaCliente({ clases: c.clasesRest, dias: c.diasRest });
        const tier: Tier =
          c.estado === "sin_clases"
            ? "vencido"
            : u.nivel === "critico" || u.nivel === "urgente"
              ? "porVencer"
              : "alDia";
        return {
          c,
          tier,
          ausente: tier !== "vencido" && c.diasSinVenir != null && c.diasSinVenir >= AUSENTE_DIAS,
        };
      }),
    [clientes],
  );

  // The header partitions the WHOLE roster, always — never the filtered view.
  // Three disjoint predicates over one set, so these three sum to the total by
  // construction (#184 defect 8: today's header renders 32 of 30).
  const totPorVencer = rows.filter((r) => r.tier === "porVencer").length;
  const totAlDia = rows.filter((r) => r.tier === "alDia").length;
  const totVencidos = rows.filter((r) => r.tier === "vencido").length;

  const q = query.trim();
  const { porVencer, alDia, vencidos } = React.useMemo(() => {
    const qf = fold(q);
    const qd = digits(q);
    const hit = q
      ? rows.filter(
          ({ c }) => fold(c.nombre).includes(qf) || (qd.length > 0 && digits(c.tel ?? "").includes(qd)),
        )
      : rows;
    const porDias = (a: Row, b: Row) => a.c.diasRest - b.c.diasRest;
    return {
      porVencer: hit.filter((r) => r.tier === "porVencer").toSorted(porDias),
      alDia: hit.filter((r) => r.tier === "alDia").toSorted(porDias),
      // Most-recently-seen first. Today's page sorts the DEADEST first (#184
      // defect 3: "monotonically inverted against the value of acting").
      vencidos: hit
        .filter((r) => r.tier === "vencido")
        .toSorted((a, b) => (a.c.diasSinVenir ?? Infinity) - (b.c.diasSinVenir ?? Infinity)),
    };
  }, [rows, q]);

  // A collapsed tier that search cannot reach would simply hide people. Typing
  // opens the fold; clearing the box closes it again.
  const verVencidos = abrirVencidos || q.length > 0;
  const vacio = porVencer.length + alDia.length + vencidos.length === 0;

  return (
    <ProtoShell
      title="DIRECTORIO"
      trailing={
        <div
          className="flex items-center justify-center"
          style={{ width: 38, height: 38, background: "var(--yellow)" }}
        >
          <Icon name="plus" size={18} color="var(--yellow-fg)" />
        </div>
      }
    >
      <div style={{ padding: "14px 22px 4px" }}>
        <H1 size={38}>CLIENTES</H1>
        <div
          className="flex flex-wrap"
          style={{ gap: "4px 10px", marginTop: 8, fontSize: 12, color: "var(--muted)" }}
        >
          <span>
            <Tnum style={{ color: "var(--fg)", fontWeight: 700 }}>{clientes.length}</Tnum> total
          </span>
          <span style={{ color: "var(--muted-soft)" }}>·</span>
          <span>
            <Tnum style={{ color: "var(--warning)", fontWeight: 700 }}>{totPorVencer}</Tnum> por
            vencer
          </span>
          <span style={{ color: "var(--muted-soft)" }}>·</span>
          <span>
            <Tnum style={{ color: "var(--green)", fontWeight: 700 }}>{totAlDia}</Tnum> al día
          </span>
          <span style={{ color: "var(--muted-soft)" }}>·</span>
          <span>
            <Tnum style={{ color: "var(--muted)", fontWeight: 700 }}>{totVencidos}</Tnum> vencidos
          </span>
        </div>
      </div>

      <div style={{ padding: "14px 16px 0" }}>
        <Input icon="search" placeholder="Nombre o teléfono…" value={query} onChange={setQuery} />
      </div>

      {vacio && (
        <div style={{ padding: "54px 24px", textAlign: "center" }}>
          <Icon name="search" size={28} color="var(--muted-soft)" />
          <div
            className="uppercase font-extrabold"
            style={{ fontSize: 14, color: "var(--fg)", marginTop: 12, letterSpacing: 0.4 }}
          >
            Sin resultados
          </div>
          <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>
            Nadie con ese nombre o teléfono.
          </div>
        </div>
      )}

      {/* ── 1. POR VENCER — the money tier, and the only amber on the page ── */}
      {porVencer.length > 0 && (
        <>
          <div
            className="flex items-baseline justify-between"
            style={{ padding: "22px 22px 8px", gap: 8 }}
          >
            <div>
              <Eyebrow color="var(--warning)">POR VENCER</Eyebrow>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                Paquete vivo, 7 días o menos. Aquí se cobra.
              </div>
            </div>
            <Tnum
              className="font-extrabold"
              style={{ fontSize: 22, lineHeight: 1, color: "var(--warning)" }}
            >
              {porVencer.length}
            </Tnum>
          </div>
          {porVencer.map((r) => (
            <ClienteRow key={r.c.id} row={r} />
          ))}
        </>
      )}

      {/* ── 2. AL DÍA ── */}
      {alDia.length > 0 && (
        <>
          <div
            className="flex items-baseline justify-between"
            style={{ padding: "26px 22px 8px", gap: 8 }}
          >
            <div>
              <Eyebrow>AL DÍA</Eyebrow>
              <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 3 }}>
                Con días por delante. No piden nada hoy.
              </div>
            </div>
            <Tnum className="font-extrabold" style={{ fontSize: 22, lineHeight: 1, color: "var(--fg)" }}>
              {alDia.length}
            </Tnum>
          </div>
          {alDia.map((r) => (
            <ClienteRow key={r.c.id} row={r} />
          ))}
        </>
      )}

      {/* ── 3. VENCIDOS — last, dimmed, folded, and never red ── */}
      {(vencidos.length > 0 || !q) && (
        <>
          <button
            onClick={() => setAbrirVencidos((v) => !v)}
            disabled={q.length > 0}
            className="forge-pressable flex w-full items-center text-left"
            style={{
              marginTop: 26,
              padding: "14px 22px",
              gap: 10,
              background: "var(--sunk)",
              borderTop: "1px solid var(--line)",
              borderBottom: verVencidos ? "1px solid var(--line)" : "1px solid transparent",
              cursor: q.length > 0 ? "default" : "pointer",
            }}
          >
            <Icon name={verVencidos ? "chevD" : "chev"} size={16} color="var(--muted)" />
            <div className="min-w-0 flex-1">
              <Eyebrow>VENCIDOS</Eyebrow>
              <div style={{ fontSize: 11, color: "var(--muted-soft)", marginTop: 3 }}>
                Se les acabó el paquete o el pase. Nadie los trabaja hoy.
              </div>
            </div>
            <Tnum className="font-extrabold" style={{ fontSize: 22, lineHeight: 1, color: "var(--muted)" }}>
              {q ? `${vencidos.length} de ${totVencidos}` : totVencidos}
            </Tnum>
          </button>
          {verVencidos && vencidos.map((r) => <ClienteRow key={r.c.id} row={r} />)}
        </>
      )}

      <QuePasa
        porVencer={totPorVencer}
        alDia={totAlDia}
        vencidos={totVencidos}
        total={clientes.length}
      />
    </ProtoShell>
  );
}

function ClienteRow({ row }: { row: Row }) {
  const { c, tier, ausente } = row;
  const vencido = tier === "vencido";
  const urgente = tier === "porVencer";
  const nombreColor = vencido ? "var(--muted)" : "var(--fg)";

  return (
    <div
      className="relative flex w-full items-center"
      style={{
        gap: 14,
        padding: "13px 22px",
        borderBottom: "1px solid var(--line)",
        background: urgente ? "var(--warning-soft)" : "transparent",
      }}
    >
      {urgente && (
        <span
          className="absolute"
          style={{ left: 0, top: 0, bottom: 0, width: 3, background: "var(--warning)" }}
        />
      )}
      <div style={{ opacity: vencido ? 0.45 : 1 }}>
        <Avatar initial={c.inicial} size={42} />
      </div>

      <div className="min-w-0 flex-1">
        <div
          className="uppercase font-semibold"
          style={{ fontSize: 14, color: nombreColor, letterSpacing: 0.4 }}
        >
          {c.nombre}
        </div>
        <div
          className="flex flex-wrap items-center"
          style={{ fontSize: 11, color: "var(--muted)", marginTop: 3, gap: 6 }}
        >
          <span className="uppercase" style={{ letterSpacing: 0.4 }}>
            {c.paquete}
          </span>
          {c.tel && (
            <>
              <span style={{ color: "var(--muted-soft)" }}>·</span>
              <Tnum>{c.tel}</Tnum>
            </>
          )}
          {/* The absence MARKER. Quiet on purpose: it never moves the row,
              never counts, never sorts. It only says "this one is paid up and
              you haven't seen them". */}
          {ausente && (
            <span
              className="inline-flex items-center uppercase font-bold"
              style={{
                gap: 4,
                padding: "2px 6px",
                border: "1px solid var(--line-soft)",
                color: "var(--silver-dim)",
                fontSize: 8.5,
                letterSpacing: 0.9,
              }}
            >
              <Icon name="clock" size={9} color="var(--silver-dim)" />
              <Tnum>{c.diasSinVenir}</Tnum>d sin venir
            </span>
          )}
          {/* Dropped on VENCIDOS: on a dimmed row the silver pill would be the
              brightest thing in the fold. */}
          {!vencido && (
            <Badge
              state={c.invitacion.estado === "cuenta_activa" ? "success" : "info"}
              style={{ padding: "2px 6px", fontSize: 8.5, letterSpacing: 0.9 }}
            >
              {c.invitacion.badge}
            </Badge>
          )}
        </div>
      </div>

      <div className="shrink-0" style={{ textAlign: "right", minWidth: 58 }}>
        {vencido ? (
          // No `∞ cl` on a dead row (#184 defect 6: 13 of 30 rows told the
          // owner an ex-member has unlimited classes left).
          <div style={{ fontSize: 11, color: "var(--muted-soft)", lineHeight: 1.35 }}>
            {c.diasRest < 0 ? (
              <>
                Venció hace
                <br />
                <Tnum>{-c.diasRest}</Tnum> días
              </>
            ) : (
              <>Pase agotado</>
            )}
          </div>
        ) : (
          <>
            <div className="flex items-baseline justify-end" style={{ gap: 3 }}>
              <Tnum
                className="font-extrabold"
                style={{
                  fontSize: urgente ? 20 : 17,
                  lineHeight: 1,
                  color: urgente ? "var(--warning)" : "var(--fg)",
                }}
              >
                {c.diasRest}
              </Tnum>
              <span style={{ fontSize: 10, color: "var(--muted)" }}>
                {c.diasRest === 1 ? "día" : "días"}
              </span>
            </div>
            {c.clasesRest !== "ilimitado" && (
              <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 4, letterSpacing: 0.3 }}>
                <Tnum>{c.clasesRestLabel}</Tnum> cl
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function QuePasa({
  porVencer,
  alDia,
  vencidos,
  total,
}: {
  porVencer: number;
  alDia: number;
  vencidos: number;
  total: number;
}) {
  const linea = { fontSize: 11.5, color: "var(--muted)", lineHeight: 1.55, marginTop: 10 };
  return (
    <div
      style={{
        margin: "34px 0 0",
        padding: "18px 22px 34px",
        background: "var(--sunk)",
        borderTop: "1px solid var(--line)",
      }}
    >
      <Eyebrow>QUÉ ESTÁS VIENDO</Eyebrow>
      <div style={linea}>
        <strong style={{ color: "var(--fg)" }}>A · TIERS.</strong> Tres tiers en una sola pantalla.
        POR VENCER es <em>urgenciaCliente</em> con el piso que hoy le falta (paquete vivo + ≤7
        días): es lo único ámbar y son{" "}
        <Tnum style={{ color: "var(--warning)", fontWeight: 700 }}>{porVencer}</Tnum> filas. El
        encabezado parte exacto: <Tnum>{porVencer}</Tnum> + <Tnum>{alDia}</Tnum> +{" "}
        <Tnum>{vencidos}</Tnum> = <Tnum>{total}</Tnum>.
      </div>
      <div style={linea}>
        Los vencidos van atenuados, al final y plegados, ordenados por quién vino más
        recientemente. Cero rojo en toda la pantalla: el color más fuerte no se gasta en quien ya
        se fue.
      </div>
      <div style={linea}>
        «24d sin venir» es un <strong style={{ color: "var(--fg)" }}>marcador</strong>: no crea
        sección, no se cuenta y no ordena. 12 de 12 sistemas miden ausencia; ninguno ordena el
        directorio con ella.
      </div>
      <div style={linea}>
        <strong style={{ color: "var(--warning)" }}>CUESTA —</strong> Hector, el único riesgo real
        de hoy (pagado, 12 días, 24 sin venir), queda en AL DÍA con una insignia gris fácil de
        saltar. Esta variante apuesta a que manda el reloj de cobro; si esa apuesta está mal, el
        marcador es demasiado callado para salvarla.
      </div>
      <div style={linea}>
        <strong style={{ color: "var(--warning)" }}>CUESTA —</strong> a 500 socios POR VENCER pasa
        a <Tnum>66</Tnum> filas: el tier <em>ordena</em> la pantalla, no la <em>acota</em>. Y el
        pliegue esconde a los vencidos de la vista (por eso se abre solo al escribir en el
        buscador).
      </div>
      <div style={{ marginTop: 18 }}>
        <a href="/proto" style={{ fontSize: 10.5, letterSpacing: 1.2, color: "var(--muted-soft)" }}>
          ← VOLVER AL ÍNDICE
        </a>
      </div>
    </div>
  );
}
