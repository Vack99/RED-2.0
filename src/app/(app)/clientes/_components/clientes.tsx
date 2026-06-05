"use client";

import * as React from "react";
import Link from "next/link";
import { Icon } from "@/components/forge/icon";
import { AppBar, Avatar, Eyebrow, H1, Input, Tnum } from "@/components/forge/ui";
import { useFlip } from "@/components/forge/use-flip";
import { resumirRoster, urgenciaCliente } from "@/domain/rules";
import type { NivelUrgencia } from "@/domain/types";
import type { ClienteDerivado } from "@/lib/data/derive";

type Sort = "dias" | "nombre" | "asist";

/** The numeric classes a client has left ("ilimitado" → no ceiling). */
function clasesNum(c: ClienteDerivado): number {
  return c.clasesRest === "ilimitado" ? Infinity : c.clasesRest;
}

/** Map an urgency level to its accent color (pure presentation). */
function urgencyColor(nivel: NivelUrgencia) {
  return nivel === "critico" ? "var(--red)"
    : nivel === "urgente" ? "var(--gold)"
    : nivel === "pronto" ? "var(--fg)"
    : "var(--muted)";
}

export function ClientesScreen({ clientes }: { clientes: ClienteDerivado[] }) {
  const [query, setQuery] = React.useState("");
  const [showFilters, setShowFilters] = React.useState(false);
  const [renovar, setRenovar] = React.useState(false);
  const [diasMax, setDiasMax] = React.useState<number | null>(null);
  const [clasesMax, setClasesMax] = React.useState<number | null>(null);
  const [sort, setSort] = React.useState<Sort>("dias");

  const withU = React.useMemo(
    () => clientes.map((c) => ({ c, u: urgenciaCliente({ clases: c.clasesRest, dias: c.diasRest }) })),
    [clientes],
  );
  const renovarCount = withU.filter((x) => x.u.nivel === "critico" || x.u.nivel === "urgente").length;
  const { vigentes } = resumirRoster(clientes.map((c) => c.estado));

  const list = React.useMemo(() => {
    let list = withU;
    if (renovar) list = list.filter((x) => x.u.nivel === "critico" || x.u.nivel === "urgente");
    if (diasMax != null) list = list.filter((x) => x.c.diasRest <= diasMax);
    if (clasesMax != null) list = list.filter((x) => clasesNum(x.c) <= clasesMax);
    if (query) {
      const q = query.toLowerCase();
      list = list.filter((x) => x.c.nombre.toLowerCase().includes(q) || x.c.tel.includes(query));
    }
    const sorters: Record<Sort, (a: typeof withU[0], b: typeof withU[0]) => number> = {
      dias: (a, b) => a.c.diasRest - b.c.diasRest,
      nombre: (a, b) => a.c.nombre.localeCompare(b.c.nombre),
      asist: (a, b) => b.c.asistEsteMes - a.c.asistEsteMes,
    };
    return list.toSorted(sorters[sort]);
  }, [withU, renovar, diasMax, clasesMax, query, sort]);

  const activeCount = (renovar ? 1 : 0) + (diasMax != null ? 1 : 0) + (clasesMax != null ? 1 : 0);
  const anyFilter = activeCount > 0 || !!query;
  const clearAll = () => { setRenovar(false); setDiasMax(null); setClasesMax(null); setQuery(""); };

  // FLIP: animate rows to their new spot when the order/contents change.
  const flipRow = useFlip([sort, renovar, diasMax, clasesMax, query]);

  return (
    <div>
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
        <div className="flex" style={{ gap: 14, marginTop: 8, fontSize: 12, color: "var(--muted)" }}>
          <span><Tnum style={{ color: "var(--fg)", fontWeight: 700 }}>{clientes.length}</Tnum> total</span>
          <span style={{ color: "var(--muted-soft)" }}>·</span>
          <span><Tnum style={{ color: "var(--green)", fontWeight: 700 }}>{vigentes}</Tnum> vigentes</span>
          <span style={{ color: "var(--muted-soft)" }}>·</span>
          <span><Tnum style={{ color: "var(--gold)", fontWeight: 700 }}>{renovarCount}</Tnum> por renovar</span>
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
            border: `1px solid ${showFilters ? "var(--fg)" : activeCount > 0 ? "var(--yellow)" : "var(--line)"}`,
            cursor: "pointer",
          }}
        >
          <Icon name="filter" size={18} color={showFilters ? "var(--canvas)" : activeCount > 0 ? "var(--gold)" : "var(--muted)"} />
          {activeCount > 0 && (
            <span
              className="absolute flex items-center justify-center font-extrabold"
              style={{ top: -6, right: -6, minWidth: 18, height: 18, padding: "0 5px", background: "var(--yellow)", color: "var(--ink)", fontSize: 10.5, lineHeight: 1 }}
            >
              <Tnum>{activeCount}</Tnum>
            </span>
          )}
        </button>
      </div>

      {/* Collapsible filter panel — animates open/close with a grid-rows
          0fr↔1fr collapse + fade (~240ms) instead of a hard mount jump. The
          global reduced-motion block neutralizes the durations, so it snaps
          open/closed for users who ask for less motion. */}
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
                style={{ gap: 12, padding: "11px 13px", cursor: "pointer", background: renovar ? "var(--yellow-soft)" : "var(--surface)", border: `1px solid ${renovar ? "var(--yellow)" : "var(--line)"}` }}
              >
                <div className="flex shrink-0 items-center justify-center" style={{ width: 30, height: 30, background: renovar ? "var(--yellow)" : "transparent", border: renovar ? "none" : "1px solid var(--line)" }}>
                  <Icon name="alert" size={15} color={renovar ? "var(--ink)" : "var(--gold)"} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="uppercase font-extrabold" style={{ fontSize: 13, letterSpacing: 0.5, color: "var(--fg)" }}>Por renovar</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>Se les acaban clases o días pronto</div>
                </div>
                <Tnum className="font-extrabold" style={{ fontSize: 22, lineHeight: 1, color: renovar ? "var(--gold)" : "var(--fg)" }}>{renovarCount}</Tnum>
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
            <button onClick={clearAll} className="forge-pressable uppercase font-bold" style={{ background: "transparent", border: "none", cursor: "pointer", padding: "8px 6px", margin: "-8px -6px", color: "var(--gold)", fontSize: 10, letterSpacing: 0.8 }}>
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

      {/* List — flows into the shell's <main> scroller (no nested scroll container) */}
      <div style={{ paddingBottom: 12 }}>
        {list.length === 0 && (
          <div style={{ padding: "54px 24px", textAlign: "center" }}>
            <Icon name={renovar ? "check" : "users"} size={28} color="var(--muted-soft)" />
            <div className="uppercase font-extrabold" style={{ fontSize: 14, color: "var(--fg)", marginTop: 12, letterSpacing: 0.4 }}>{renovar ? "Todo al día" : "Sin clientes"}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>{renovar ? "Nadie en riesgo con estos filtros." : "Ajusta los filtros o agrega un cliente."}</div>
          </div>
        )}
        {list.map(({ c, u }) => {
          const col = urgencyColor(u.nivel);
          const showBar = u.nivel === "critico" || u.nivel === "urgente";
          const clsLabel = c.clasesRestLabel;
          const bindingIsDias = u.vinculante === "dias";
          return (
            <Link
              key={c.id}
              ref={flipRow(c.id)}
              href={`/clientes/${c.id}`}
              prefetch
              className="forge-pressable relative flex w-full items-center text-left"
              style={{ gap: 14, padding: "14px 22px", background: "transparent", border: "none", borderBottom: "1px solid var(--line)", cursor: "pointer" }}
            >
              <span className="absolute" style={{ left: 0, top: 0, bottom: 0, width: 3, background: showBar ? col : "transparent" }} />
              <Avatar initial={c.inicial} size={42} />
              <div className="min-w-0 flex-1">
                <div className="uppercase font-semibold" style={{ fontSize: 14, color: "var(--fg)", letterSpacing: 0.4 }}>{c.nombre}</div>
                <div className="flex flex-wrap items-center" style={{ fontSize: 11, color: "var(--muted)", marginTop: 3, gap: 6 }}>
                  <span className="uppercase" style={{ letterSpacing: 0.4 }}>{c.paquete}</span>
                  <span style={{ color: "var(--muted-soft)" }}>·</span>
                  <Tnum>{c.tel}</Tnum>
                </div>
              </div>
              <div className="shrink-0" style={{ textAlign: "right", minWidth: 56 }}>
                {bindingIsDias ? (
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
            </Link>
          );
        })}
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
