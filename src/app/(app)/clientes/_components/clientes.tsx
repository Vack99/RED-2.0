"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Icon } from "@/components/forge/icon";
import { AppBar, Avatar, Eyebrow, H1, Input, Tnum } from "@/components/forge/ui";
import type { ClienteDerivado } from "@/lib/data/derive";

// Thresholds tuned for 8/12-class, 20–30 day memberships.
const CL_DAYS = { hot: 3, warm: 7, soft: 14 };
const CL_CLS = { hot: 1, warm: 3, soft: 5 };

type Level = "critico" | "urgente" | "pronto" | "ok";
type Sort = "dias" | "nombre" | "asist";

/**
 * Unified running-out model: a client is as urgent as their WORST
 * dimension. `binding` is whichever (clases|días) lapses first; `score`
 * (lower = sooner) drives the urgency sort.
 */
function clientUrgency(c: ClienteDerivado) {
  const days = c.diasRest;
  const cls = c.clasesRest === "ilimitado" ? Infinity : c.clasesRest;
  let level: Level = "ok";
  if (days <= CL_DAYS.hot || cls <= CL_CLS.hot) level = "critico";
  else if (days <= CL_DAYS.warm || cls <= CL_CLS.warm) level = "urgente";
  else if (days <= CL_DAYS.soft || cls <= CL_CLS.soft) level = "pronto";
  const dayN = days / CL_DAYS.soft;
  const clsN = cls / CL_CLS.soft;
  const binding: "clases" | "dias" = clsN < dayN ? "clases" : "dias";
  return { level, binding, score: Math.min(dayN, clsN), days, cls };
}

function urgencyColor(level: Level) {
  return level === "critico" ? "var(--red)"
    : level === "urgente" ? "var(--gold)"
    : level === "pronto" ? "var(--fg)"
    : "var(--muted)";
}

export function ClientesScreen({ clientes }: { clientes: ClienteDerivado[] }) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [showFilters, setShowFilters] = React.useState(false);
  const [renovar, setRenovar] = React.useState(false);
  const [diasMax, setDiasMax] = React.useState<number | null>(null);
  const [clasesMax, setClasesMax] = React.useState<number | null>(null);
  const [sort, setSort] = React.useState<Sort>("dias");

  const withU = clientes.map((c) => ({ c, u: clientUrgency(c) }));
  const renovarCount = withU.filter((x) => x.u.level === "critico" || x.u.level === "urgente").length;
  const vigentes = withU.filter((x) => x.c.estado === "activo").length;

  let list = withU;
  if (renovar) list = list.filter((x) => x.u.level === "critico" || x.u.level === "urgente");
  if (diasMax != null) list = list.filter((x) => x.c.diasRest <= diasMax);
  if (clasesMax != null) list = list.filter((x) => x.u.cls <= clasesMax);
  if (query) {
    const q = query.toLowerCase();
    list = list.filter((x) => x.c.nombre.toLowerCase().includes(q) || x.c.tel.includes(query));
  }
  const sorters: Record<Sort, (a: typeof withU[0], b: typeof withU[0]) => number> = {
    dias: (a, b) => a.c.diasRest - b.c.diasRest,
    nombre: (a, b) => a.c.nombre.localeCompare(b.c.nombre),
    asist: (a, b) => b.c.asistEsteMes - a.c.asistEsteMes,
  };
  list = [...list].sort(sorters[sort]);

  const activeCount = (renovar ? 1 : 0) + (diasMax != null ? 1 : 0) + (clasesMax != null ? 1 : 0);
  const anyFilter = activeCount > 0 || !!query;
  const clearAll = () => { setRenovar(false); setDiasMax(null); setClasesMax(null); setQuery(""); };

  return (
    <div className="flex h-full flex-col">
      <AppBar
        center="DIRECTORIO"
        trailing={
          <button
            onClick={() => router.push("/vender")}
            aria-label="Nuevo cliente"
            className="flex items-center justify-center"
            style={{ width: 38, height: 38, background: "var(--yellow)", border: "none", cursor: "pointer", padding: 0 }}
          >
            <Icon name="plus" size={18} color="var(--ink)" />
          </button>
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

      {/* Collapsible filter panel */}
      {showFilters && (
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
      )}

      {/* Count · clear · sort */}
      <div className="flex items-center justify-between" style={{ padding: "14px 22px 6px" }}>
        <div className="flex items-center" style={{ gap: 10 }}>
          <Eyebrow style={{ fontSize: 10 }}>{list.length} {list.length === 1 ? "CLIENTE" : "CLIENTES"}</Eyebrow>
          {anyFilter && (
            <button onClick={clearAll} className="uppercase font-bold" style={{ background: "transparent", border: "none", cursor: "pointer", padding: 0, color: "var(--gold)", fontSize: 10, letterSpacing: 0.8 }}>
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
              style={{ background: "transparent", border: "none", padding: "4px 6px", cursor: "pointer", color: sort === s.k ? "var(--yellow)" : "var(--muted)", fontWeight: 700, fontSize: 11, letterSpacing: 0.4, borderBottom: sort === s.k ? "1.5px solid var(--yellow)" : "1.5px solid transparent", marginLeft: i === 0 ? 0 : 4 }}
            >
              {s.l}
            </button>
          ))}
        </div>
      </div>

      {/* List */}
      <div className="forge-scroll flex-1 overflow-auto" style={{ paddingBottom: 12 }}>
        {list.length === 0 && (
          <div style={{ padding: "54px 24px", textAlign: "center" }}>
            <Icon name={renovar ? "check" : "users"} size={28} color="var(--muted-soft)" />
            <div className="uppercase font-extrabold" style={{ fontSize: 14, color: "var(--fg)", marginTop: 12, letterSpacing: 0.4 }}>{renovar ? "Todo al día" : "Sin clientes"}</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>{renovar ? "Nadie en riesgo con estos filtros." : "Ajusta los filtros o agrega un cliente."}</div>
          </div>
        )}
        {list.map(({ c, u }) => {
          const col = urgencyColor(u.level);
          const showBar = u.level === "critico" || u.level === "urgente";
          const clsLabel = c.clasesRestLabel;
          const bindingIsDias = u.binding === "dias";
          return (
            <button
              key={c.id}
              onClick={() => router.push(`/clientes/${c.id}`)}
              className="relative flex w-full items-center text-left"
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
            </button>
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
              className="flex-1 font-bold"
              style={{ padding: "8px 4px", background: on ? "var(--fg)" : "transparent", border: `1px solid ${on ? "var(--fg)" : "var(--line)"}`, color: on ? "var(--canvas)" : "var(--fg)", fontSize: 11, letterSpacing: 0.3, cursor: "pointer", whiteSpace: "nowrap" }}
            >
              {o.l}
            </button>
          );
        })}
      </div>
    </div>
  );
}
