"use client";

// apps/admin/src/app/proto/d-ruido/_components/ruido.tsx — OPTION D · RUIDO.
//
// The YAGNI control for map #180. This file is a line-for-line copy of the
// baseline (../../actual/_components/actual.tsx, itself a verbatim copy of the
// real ClientesScreen) with EXACTLY FOUR behavioural changes, each marked
// `FIX n` below. No sections, no tiers, no collapse, no absent marker, no new
// concepts, no new components. One flat list, the same filters, the same rows.
//
//   FIX 1 — urgenciaCliente gets a floor: a spent package is `vencido`, not
//           `critico`. (#184: `critico` fires on 19/30 rows with 1 actionable
//           = 5.3% precision, BELOW the 13% base rate; #185 reproduces it at
//           7.1% on a second organic tenant.)
//   FIX 2 — colour is reallocated: --warning (7.9:1) for the rows that really
//           expire this week, --muted for the ones that already did. Red stops
//           firing on the dead — and therefore stops firing at all here.
//   FIX 3 — the header partitions. Today `vigentes + por renovar = total + k`
//           with k ≥ 0 always (#184 finding 8: it renders 32 of 30).
//   FIX 4 — search folds diacritics and tolerates formatted phone numbers.
//           (#184 finding 1: `chavez` matches 0 of 4 Chávez; 13 of 30 live
//           names are accented.)
//
// Plus one sort consequence of FIX 1: the `Días` comparator groups the spent
// packages last, so the graveyard no longer sits permanently on top of the
// living. Same comparator, one extra group key — not a new order.
//
// Everything else — every threshold, every filter, every pixel — is untouched,
// deliberately: this variant only answers "how much of the complaint is a
// four-line bug fix?", and it can only answer that if nothing else moves.

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { telDigits } from "@gym/format";
import { Icon } from "@gym/ui/forge/icon";
import { AppBar, Avatar, Badge, Eyebrow, H1, Input, Tnum } from "@gym/ui/forge/ui";
import { useFlip } from "@gym/ui/forge/use-flip";
import { useRevealedWindow } from "@gym/ui/forge/use-revealed-window";
import { urgenciaCliente } from "@gym/domain/rules";
import type { NivelUrgencia } from "@gym/domain/types";
import type { RosterClient } from "../../_fixtures";
import { ProtoShell } from "../../_components/shell";

type Sort = "dias" | "nombre" | "asist";

/** FIX 1 — the level `urgenciaCliente` is missing. `rules.ts:149` reads
 *  `dias <= URGENCIA_DIAS.critico → critico` with no lower bound, so a member
 *  expiring in 2 days and an ex-member gone 44 days come back identical. */
type Nivel = NivelUrgencia | "vencido";

/** The numeric classes a client has left ("ilimitado" → no ceiling). */
function clasesNum(c: RosterClient): number {
  return c.clasesRest === "ilimitado" ? Infinity : c.clasesRest;
}

/** FIX 2 — map a level to its accent colour. The two edits: `vencido` takes
 *  --muted, and the live-and-expiring rows take --warning (#e8902a, 7.9:1)
 *  instead of --red (#ff5a5a, 6.47:1) for the dead and --gold (#7e0d10,
 *  **1.84:1** — the perfect classifier nobody can see) for the live ones. */
function urgencyColor(nivel: Nivel) {
  return nivel === "critico" || nivel === "urgente" ? "var(--warning)"
    : nivel === "pronto" ? "var(--fg)"
    : "var(--muted)";
}

/** FIX 4 — fold diacritics so `chavez` finds Chávez. U+0300–U+036F is the
 *  combining-marks block; NFD splits `á` into `a` + mark, the replace drops it.
 *  (Explicit range, not `\p{Diacritic}`: unicode property escapes need an
 *  ES2018 target and tsconfig.base.json targets ES2017.) */
function fold(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

export function RuidoScreen({ clientes }: { clientes: RosterClient[] }) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [showFilters, setShowFilters] = React.useState(false);
  const [renovar, setRenovar] = React.useState(false);
  const [online, setOnline] = React.useState(false);
  const [diasMax, setDiasMax] = React.useState<number | null>(null);
  const [clasesMax, setClasesMax] = React.useState<number | null>(null);
  const [sort, setSort] = React.useState<Sort>("dias");

  const withU = React.useMemo(
    () =>
      clientes.map((c) => {
        const u = urgenciaCliente({ clases: c.clasesRest, dias: c.diasRest });
        // FIX 1 — the floor. It needs no new rule and no new threshold: the
        // domain already draws this exact line one function over.
        // `derivarEstado` returns `sin_clases` for `dias < 0 || clases <= 0`
        // (rules.ts:106-116) and the ficha already renders it in a different
        // colour from `por_vencer` (ui.tsx:112-114). The whole bug is that
        // `urgenciaCliente` never agreed with it. So: reuse `c.estado`.
        const vencido = c.estado === "sin_clases";
        const nivel: Nivel = vencido ? "vencido" : u.nivel;
        return { c, u, nivel, vencido };
      }),
    [clientes],
  );

  // FIX 3 — three disjoint buckets that sum to `clientes.length`, every day,
  // at every scale. `porRenovar` can no longer contain a dead row, and
  // `alDia` is everyone the floor didn't catch and the alert didn't flag.
  const porRenovar = withU.filter((x) => x.nivel === "critico" || x.nivel === "urgente").length;
  const vencidos = withU.filter((x) => x.vencido).length;
  const alDia = clientes.length - porRenovar - vencidos;
  const onlineCount = withU.filter((x) => x.c.pendienteOnline).length;

  // Today's unfloored count, kept ONLY to state the delta honestly in the
  // "qué estás viendo" panel — nothing on the screen reads it.
  const marcadasHoy = withU.filter((x) => x.u.nivel === "critico" || x.u.nivel === "urgente").length;

  const list = React.useMemo(() => {
    let list = withU;
    if (renovar) list = list.filter((x) => x.nivel === "critico" || x.nivel === "urgente");
    if (online) list = list.filter((x) => x.c.pendienteOnline);
    if (diasMax != null) list = list.filter((x) => x.c.diasRest <= diasMax);
    if (clasesMax != null) list = list.filter((x) => clasesNum(x.c) <= clasesMax);
    if (query) {
      // FIX 4. `telDigits` (packages/format) is documented as the single home
      // for "what is a valid tel" and this box never called it, so a number
      // pasted from a WhatsApp card ("614 123 4501") matched nothing.
      const q = fold(query);
      const qTel = telDigits(query);
      list = list.filter(
        (x) => fold(x.c.nombre).includes(q) || (!!qTel && !!x.c.tel?.includes(qTel)),
      );
    }
    const sorters: Record<Sort, (a: (typeof withU)[0], b: (typeof withU)[0]) => number> = {
      // FIX 1's sort consequence: the same `diasRest` ascending comparator,
      // with spent packages floored into a trailing group. The living are no
      // longer buried under an obituary that is permanently more negative.
      dias: (a, b) => Number(a.vencido) - Number(b.vencido) || a.c.diasRest - b.c.diasRest,
      nombre: (a, b) => a.c.nombre.localeCompare(b.c.nombre),
      asist: (a, b) => b.c.asistEsteMes - a.c.asistEsteMes,
    };
    return list.toSorted(sorters[sort]);
  }, [withU, renovar, online, diasMax, clasesMax, query, sort]);

  const activeCount =
    (renovar ? 1 : 0) + (online ? 1 : 0) + (diasMax != null ? 1 : 0) + (clasesMax != null ? 1 : 0);
  const anyFilter = activeCount > 0 || !!query;
  const clearAll = () => { setRenovar(false); setOnline(false); setDiasMax(null); setClasesMax(null); setQuery(""); };

  const { visible, revealAll } = useRevealedWindow(list);
  const flipRow = useFlip([sort, renovar, online, diasMax, clasesMax, query, showFilters, revealAll]);

  return (
    <ProtoShell>
      <AppBar
        center="DIRECTORIO"
        trailing={
          <Link
            href="/vender"
            prefetch
            aria-label="Nuevo cliente"
            className="flex items-center justify-center"
            style={{ width: 38, height: 38, background: "var(--yellow)", border: "none", cursor: "pointer", padding: 0 }}
          >
            <Icon name="plus" size={18} color="var(--ink)" />
          </Link>
        }
      />

      <div style={{ padding: "14px 22px 4px" }}>
        <H1 size={38}>CLIENTES</H1>
        {/* FIX 3 — a partition: por renovar + al día + vencidos = total. */}
        <div className="flex flex-wrap" style={{ gap: 10, marginTop: 8, fontSize: 11.5, color: "var(--muted)" }}>
          <span><Tnum style={{ color: "var(--fg)", fontWeight: 700 }}>{clientes.length}</Tnum> total</span>
          <span style={{ color: "var(--muted-soft)" }}>·</span>
          <span><Tnum style={{ color: "var(--warning)", fontWeight: 700 }}>{porRenovar}</Tnum> por renovar</span>
          <span style={{ color: "var(--muted-soft)" }}>·</span>
          <span><Tnum style={{ color: "var(--green)", fontWeight: 700 }}>{alDia}</Tnum> al día</span>
          <span style={{ color: "var(--muted-soft)" }}>·</span>
          <span><Tnum style={{ color: "var(--muted)", fontWeight: 700 }}>{vencidos}</Tnum> vencidos</span>
        </div>
      </div>

      {/* Search + funnel */}
      <div className="flex" style={{ padding: "14px 16px 0", gap: 8 }}>
        <div className="min-w-0 flex-1">
          <Input icon="search" placeholder="Nombre o teléfono…" value={query} onChange={setQuery} />
        </div>
        <button
          onClick={() => setShowFilters((v) => !v)}
          aria-label="Filtros"
          className="relative flex shrink-0 items-center justify-center"
          style={{
            width: 52,
            background: showFilters ? "var(--fg)" : "var(--surface)",
            border: `1px solid ${showFilters ? "var(--fg)" : activeCount > 0 ? "var(--warning)" : "var(--line)"}`,
            cursor: "pointer",
          }}
        >
          <Icon name="filter" size={18} color={showFilters ? "var(--canvas)" : activeCount > 0 ? "var(--warning)" : "var(--muted)"} />
          {activeCount > 0 && (
            <span
              className="absolute flex items-center justify-center font-extrabold"
              style={{ top: -6, right: -6, minWidth: 18, height: 18, padding: "0 5px", background: "var(--warning)", color: "var(--ink)", fontSize: 10.5, lineHeight: 1 }}
            >
              <Tnum>{activeCount}</Tnum>
            </span>
          )}
        </button>
      </div>

      {/* Collapsible filter panel — unchanged from today, on purpose. The only
          thing that moved is the number inside it: "Por renovar" counts the
          floored set now, so the filter finally selects a queue you can work. */}
      <div
        style={{
          display: "grid",
          gridTemplateRows: showFilters ? "1fr" : "0fr",
          opacity: showFilters ? 1 : 0,
          transition: "grid-template-rows 240ms cubic-bezier(.32,.72,0,1), opacity 240ms cubic-bezier(.32,.72,0,1)",
        }}
      >
        <div className="min-h-0 overflow-hidden" aria-hidden={!showFilters} inert={!showFilters}>
          <div style={{ background: "var(--sunk)", borderBottom: "1px solid var(--line)", padding: "12px 0 14px", marginTop: 12 }}>
            <div style={{ padding: "0 16px" }}>
              <button
                onClick={() => setRenovar((v) => !v)}
                className="flex w-full items-center text-left"
                style={{ gap: 12, padding: "11px 13px", cursor: "pointer", background: renovar ? "var(--warning-soft)" : "var(--surface)", border: `1px solid ${renovar ? "var(--warning)" : "var(--line)"}` }}
              >
                <div className="flex shrink-0 items-center justify-center" style={{ width: 30, height: 30, background: renovar ? "var(--warning)" : "transparent", border: renovar ? "none" : "1px solid var(--line)" }}>
                  <Icon name="alert" size={15} color={renovar ? "var(--ink)" : "var(--warning)"} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="uppercase font-extrabold" style={{ fontSize: 13, letterSpacing: 0.5, color: "var(--fg)" }}>Por renovar</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>Se les acaban clases o días pronto</div>
                </div>
                <Tnum className="font-extrabold" style={{ fontSize: 22, lineHeight: 1, color: renovar ? "var(--warning)" : "var(--fg)" }}>{porRenovar}</Tnum>
              </button>
            </div>
            <div style={{ padding: "10px 16px 0" }}>
              <button
                onClick={() => setOnline((v) => !v)}
                className="flex w-full items-center text-left"
                style={{ gap: 12, padding: "11px 13px", cursor: "pointer", background: online ? "var(--green-soft)" : "var(--surface)", border: `1px solid ${online ? "var(--green)" : "var(--line)"}` }}
              >
                <div className="flex shrink-0 items-center justify-center" style={{ width: 30, height: 30, background: online ? "var(--green)" : "transparent", border: online ? "none" : "1px solid var(--line)" }}>
                  <Icon name="user" size={15} color={online ? "var(--canvas)" : "var(--green)"} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="uppercase font-extrabold" style={{ fontSize: 13, letterSpacing: 0.5, color: "var(--fg)" }}>Registrados online</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>Con cuenta en la app, sin paquete</div>
                </div>
                <Tnum className="font-extrabold" style={{ fontSize: 22, lineHeight: 1, color: online ? "var(--green)" : "var(--fg)" }}>{onlineCount}</Tnum>
              </button>
            </div>
            <FacetRow label="Días" value={diasMax} onChange={setDiasMax} options={[{ v: null, l: "Todos" }, { v: 14, l: "≤14" }, { v: 7, l: "≤7" }, { v: 3, l: "≤3" }]} />
            <FacetRow label="Clases" value={clasesMax} onChange={setClasesMax} options={[{ v: null, l: "Todas" }, { v: 5, l: "≤5" }, { v: 3, l: "≤3" }, { v: 1, l: "≤1" }]} />
          </div>
        </div>
      </div>

      {/* Count · clear · sort */}
      <div className="flex items-center justify-between" style={{ padding: "14px 22px 6px" }}>
        <div className="flex items-center" style={{ gap: 10 }}>
          <Eyebrow style={{ fontSize: 10 }}>{list.length} {list.length === 1 ? "CLIENTE" : "CLIENTES"}</Eyebrow>
          {anyFilter && (
            <button onClick={clearAll} className="forge-pressable uppercase font-bold" style={{ background: "transparent", border: "none", cursor: "pointer", padding: "8px 6px", margin: "-8px -6px", color: "var(--warning)", fontSize: 10, letterSpacing: 0.8 }}>
              Limpiar
            </button>
          )}
        </div>
        <div className="flex items-center">
          <span style={{ fontSize: 10, color: "var(--muted)", letterSpacing: 1, marginRight: 8 }}>ORDEN</span>
          {([{ k: "dias", l: "Días" }, { k: "nombre", l: "A→Z" }, { k: "asist", l: "Asist." }] as const).map((s, i) => (
            <button
              key={s.k}
              onClick={() => setSort(s.k)}
              className="forge-pressable"
              style={{ background: "transparent", border: "none", padding: "10px 8px", cursor: "pointer", color: sort === s.k ? "var(--yellow)" : "var(--muted)", fontWeight: 700, fontSize: 11, letterSpacing: 0.4, marginLeft: i === 0 ? 0 : 8, transition: "color 150ms cubic-bezier(.32,.72,0,1)" }}
            >
              <span style={{ borderBottom: "1.5px solid", borderColor: sort === s.k ? "var(--yellow)" : "transparent", paddingBottom: 2, transition: "border-color 150ms cubic-bezier(.32,.72,0,1)" }}>{s.l}</span>
            </button>
          ))}
        </div>
      </div>

      {/* List — one flat list, exactly as today. No headings, no dividers, no
          collapse: the ONLY thing separating the living from the dead is that
          the dead are grey and at the bottom. */}
      <div style={{ paddingBottom: 12 }}>
        {list.length === 0 && (
          <div style={{ padding: "54px 24px", textAlign: "center" }}>
            <Icon name={renovar ? "check" : "users"} size={28} color="var(--muted-soft)" />
            <div className="uppercase font-extrabold" style={{ fontSize: 14, color: "var(--fg)", marginTop: 12, letterSpacing: 0.4 }}>{renovar ? "Todo al día" : "Sin clientes"}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>{renovar ? "Nadie en riesgo con estos filtros." : "Ajusta los filtros o agrega un cliente."}</div>
          </div>
        )}
        {visible.map(({ c, u, nivel }) => {
          const col = urgencyColor(nivel);
          const showBar = nivel === "critico" || nivel === "urgente";
          const clsLabel = c.clasesRestLabel;
          const bindingIsDias = u.vinculante === "dias";
          return (
            <div
              key={c.id}
              ref={flipRow(c.id)}
              className="relative flex w-full items-center"
              style={{ gap: 14, borderBottom: "1px solid var(--line)" }}
            >
              <span className="absolute" style={{ left: 0, top: 0, bottom: 0, width: 3, background: showBar ? col : "transparent" }} />
              <Link
                href={`/clientes/${c.id}`}
                className="forge-pressable flex min-w-0 flex-1 items-center text-left"
                style={{ gap: 14, padding: "14px 0 14px 22px", background: "transparent", border: "none", cursor: "pointer" }}
              >
                <Avatar initial={c.inicial} size={42} />
                <div className="min-w-0 flex-1">
                  <div className="uppercase font-semibold" style={{ fontSize: 14, color: "var(--fg)", letterSpacing: 0.4 }}>{c.nombre}</div>
                  <div className="flex flex-wrap items-center" style={{ fontSize: 11, color: "var(--muted)", marginTop: 3, gap: 6 }}>
                    <span className="uppercase" style={{ letterSpacing: 0.4 }}>{c.paquete}</span>
                    {c.tel && (
                      <>
                        <span style={{ color: "var(--muted-soft)" }}>·</span>
                        <Tnum>{c.tel}</Tnum>
                      </>
                    )}
                    <Badge
                      state={c.invitacion.estado === "cuenta_activa" ? "success" : "info"}
                      style={{ padding: "2px 6px", fontSize: 8.5, letterSpacing: 0.9 }}
                    >
                      {c.invitacion.badge}
                    </Badge>
                  </div>
                </div>
              </Link>
              <div className="shrink-0" style={{ textAlign: "right", minWidth: 56, padding: "14px 22px 14px 0" }}>
                {c.pendienteOnline ? (
                  <button
                    onClick={() => router.push(`/vender?cliente=${c.id}`)}
                    className="forge-pressable uppercase font-extrabold"
                    style={{ padding: "10px 14px", background: "transparent", color: "var(--fg)", border: "1px solid var(--silver-dim)", fontSize: 12, letterSpacing: 1.3, cursor: "pointer" }}
                  >
                    COBRAR
                  </button>
                ) : bindingIsDias ? (
                  <>
                    <div className="flex items-baseline justify-end" style={{ gap: 3 }}>
                      <Tnum className="font-extrabold" style={{ fontSize: 17, lineHeight: 1, color: col }}>{c.diasRest}</Tnum>
                      <span style={{ fontSize: 10, color: "var(--muted)" }}>{c.diasRest === 1 ? "día" : "días"}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 4, letterSpacing: 0.3 }}><Tnum>{clsLabel}</Tnum> cl</div>
                  </>
                ) : (
                  <>
                    <div className="flex items-baseline justify-end" style={{ gap: 3 }}>
                      <Tnum className="font-extrabold" style={{ fontSize: 17, lineHeight: 1, color: col }}>{clsLabel}</Tnum>
                      <span style={{ fontSize: 10, color: "var(--muted)" }}>{c.clasesRest === 1 ? "clase" : "clases"}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 4, letterSpacing: 0.3 }}><Tnum>{c.diasRest}</Tnum> d</div>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <QueEstasViendo
        total={clientes.length}
        porRenovar={porRenovar}
        alDia={alDia}
        vencidos={vencidos}
        marcadasHoy={marcadasHoy}
      />
    </ProtoShell>
  );
}

/** Prototype-only footer (every /proto variant renders one): what this
 *  surface does differently, and what it costs. Counts are computed from the
 *  rendered roster, not asserted, so they stay true at n=30/200/500. */
function QueEstasViendo({
  total,
  porRenovar,
  alDia,
  vencidos,
  marcadasHoy,
}: {
  total: number;
  porRenovar: number;
  alDia: number;
  vencidos: number;
  marcadasHoy: number;
}) {
  const pctVencidos = Math.round((vencidos / total) * 100);
  const line: React.CSSProperties = { fontSize: 11.5, color: "var(--muted)", lineHeight: 1.55 };
  return (
    <div style={{ borderTop: "1px solid var(--line)", background: "var(--sunk)", padding: "18px 22px 34px" }}>
      <Eyebrow style={{ marginBottom: 10 }}>Qué estás viendo</Eyebrow>
      <div style={{ display: "flex", flexDirection: "column", gap: 9 }}>
        <div style={line}>
          <b style={{ color: "var(--fg)" }}>D · RUIDO — no se construyó nada.</b> Misma lista plana,
          mismas filas, mismos filtros que hoy. Sólo cuatro arreglos: la urgencia tiene piso
          (vencido ≠ crítico), el color se reasigna (ámbar 7.9:1 para los que vencen, gris para los
          que ya vencieron), el encabezado sí parte ({porRenovar} + {alDia} + {vencidos} = {total};
          hoy suma de más) y la búsqueda ignora acentos: <i>chavez</i> encuentra a Chávez.
        </div>
        <div style={line}>
          Efecto medible: de <Tnum>{marcadasHoy}</Tnum> filas marcadas hoy quedan{" "}
          <Tnum style={{ color: "var(--warning)", fontWeight: 700 }}>{porRenovar}</Tnum>, y esas sí
          son reales. El rojo desaparece por completo de esta pantalla.
        </div>
        <div style={line}>
          <b style={{ color: "var(--fg)" }}>Lo que cuesta:</b> los {vencidos} vencidos siguen ahí —{" "}
          {pctVencidos}% de las filas — abajo y en gris, pero los sigues scrolleando, siguen diciendo{" "}
          <Tnum>∞ cl</Tnum>, y el filtro <i>Días ≤3</i> los sigue contando. Nada se archiva nunca.
        </div>
        <div style={line}>
          <b style={{ color: "var(--fg)" }}>Lo que NO responde:</b> a quién estás por perder. Héctor
          Delgado lleva 24 días sin venir con 12 pagados y aquí se ve igual de tranquilo que hoy —
          esta opción no mira asistencia en absoluto.
        </div>
        <div style={line}>
          Y no hay canal: los {porRenovar} hay que verlos en pantalla y acordarse. Si la queja del
          dueño era “no sé a quién cobrarle”, esto la resuelve; si era “no sé a quién estoy
          perdiendo”, esto no la toca.
        </div>
      </div>
    </div>
  );
}

function FacetRow({
  label,
  value,
  onChange,
  options,
}: {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  options: { v: number | null; l: string }[];
}) {
  return (
    <div className="flex items-center" style={{ gap: 10, padding: "0 22px", marginTop: 8 }}>
      <span className="uppercase font-bold" style={{ width: 52, flexShrink: 0, fontSize: 9.5, letterSpacing: 1.1, color: "var(--muted)" }}>{label}</span>
      <div className="flex flex-1" style={{ gap: 6 }}>
        {options.map((o) => {
          const on = value === o.v;
          return (
            <button
              key={String(o.v)}
              onClick={() => onChange(on && o.v !== null ? null : o.v)}
              className="forge-pressable flex-1 font-bold"
              style={{ minHeight: 44, padding: "8px 4px", background: on ? "var(--fg)" : "transparent", border: `1px solid ${on ? "var(--fg)" : "var(--line)"}`, color: on ? "var(--canvas)" : "var(--fg)", fontSize: 11, letterSpacing: 0.3, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              {o.l}
            </button>
          );
        })}
      </div>
    </div>
  );
}
