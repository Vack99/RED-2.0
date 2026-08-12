"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Icon } from "@gym/ui/forge/icon";
import { AppBar, Avatar, Badge, Eyebrow, H1, Input, Tnum } from "@gym/ui/forge/ui";
import { useFlip } from "@gym/ui/forge/use-flip";
import { useRevealedWindow } from "@gym/ui/forge/use-revealed-window";
import type { NivelUrgencia } from "@gym/domain/types";
import type { ClienteRosterDTO } from "@gym/data/server/clientes";
import { markInAppNav } from "../../../../lib/nav";
import { derivarVistaRoster, filaCoincideBusqueda, type FilaRoster } from "./clientes-vm";

/** `null` = the engine's ruled order (default). Picking a named sort
 *  overrides it; re-picking the ACTIVE one clears back to `null` — same
 *  single-active-button UX as today, plus the ruled-order "off" state. */
type Sort = "dias" | "nombre" | "asist" | null;

/** The numeric classes a client has left ("ilimitado" → no ceiling). */
function clasesNum(c: ClienteRosterDTO): number {
  return c.veredicto.clases === "ilimitado" ? Infinity : c.veredicto.clases;
}

/** The días numeral the facets/sorts compare on. A package-less row has no
 *  countdown (`veredicto.dias` is honestly null), and reads 0 here — the same
 *  number the row itself renders. */
function diasNum(c: ClienteRosterDTO): number {
  return c.veredicto.dias ?? 0;
}

/** Map an urgency level to its accent color (pure presentation). */
function urgencyColor(nivel: NivelUrgencia) {
  return nivel === "critico" ? "var(--red)"
    : nivel === "urgente" ? "var(--gold)"
    : nivel === "pronto" ? "var(--fg)"
    : "var(--muted)";
}

export function ClientesScreen({
  clientes,
  initialOnline = false,
  initialRenovar = false,
  initialAunATiempo = false,
}: {
  clientes: ClienteRosterDTO[];
  /** Deep-link from the dashboard "Nuevos registros online" tile — opens the
   *  roster with the "Registrados online" filter already applied. */
  initialOnline?: boolean;
  /** Deep-link from INICIO's POR RENOVAR tile (#228) — opens the roster with
   *  the "Por renovar" filter already applied. */
  initialRenovar?: boolean;
  /** Deep-link from INICIO's AÚN A TIEMPO tile (#229) — same mechanism. */
  initialAunATiempo?: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [showFilters, setShowFilters] = React.useState(initialOnline || initialRenovar || initialAunATiempo);
  const [renovar, setRenovar] = React.useState(initialRenovar);
  const [online, setOnline] = React.useState(initialOnline);
  const [aunATiempo, setAunATiempo] = React.useState(initialAunATiempo);
  const [diasMax, setDiasMax] = React.useState<number | null>(null);
  const [clasesMax, setClasesMax] = React.useState<number | null>(null);
  const [sort, setSort] = React.useState<Sort>(null);

  // The ONE seam into the #223/#225 lifecycle engine (clientes-vm.ts) — `withU`
  // arrives in the engine's RULED order, and `conteos` is the shared source for
  // both the header ratio and the filter chips' counts (never an inline filter
  // count, #227).
  const { filas: withU, conteos } = React.useMemo(() => derivarVistaRoster(clientes), [clientes]);
  const renovarCount = conteos.porRenovar.total;
  const onlineCount = conteos.pendienteOnline;
  const aunATiempoCount = conteos.aunATiempo.total;

  const list = React.useMemo(() => {
    let list = withU;
    if (renovar) list = list.filter((x) => x.renovar);
    if (online) list = list.filter((x) => x.c.veredicto.pendienteOnline);
    if (aunATiempo) list = list.filter((x) => x.aunATiempo);
    if (diasMax != null) list = list.filter((x) => diasNum(x.c) <= diasMax);
    if (clasesMax != null) list = list.filter((x) => clasesNum(x.c) <= clasesMax);
    if (query) {
      // Diacritic-folded name arm (#224) + digit-guarded tel arm (#239) — see
      // `filaCoincideBusqueda` in clientes-vm.ts.
      list = list.filter((x) => filaCoincideBusqueda(x, query));
    }
    // Default = the engine's ruled order: `withU` already arrives sorted that way,
    // and Array#filter is order-preserving, so an untouched `sort` (null) leaves it
    // intact with zero extra work. A named sort REPLACES it; toggling the same
    // button off (see the ORDEN buttons below) returns `sort` to null.
    if (sort === null) return list;
    const sorters: Record<Exclude<Sort, null>, (a: FilaRoster, b: FilaRoster) => number> = {
      dias: (a, b) => diasNum(a.c) - diasNum(b.c),
      nombre: (a, b) => a.c.nombre.localeCompare(b.c.nombre),
      asist: (a, b) => b.c.asistEsteMes - a.c.asistEsteMes,
    };
    return list.toSorted(sorters[sort]);
  }, [withU, renovar, online, aunATiempo, diasMax, clasesMax, query, sort]);

  const activeCount =
    (renovar ? 1 : 0) + (online ? 1 : 0) + (aunATiempo ? 1 : 0) + (diasMax != null ? 1 : 0) + (clasesMax != null ? 1 : 0);
  const anyFilter = activeCount > 0 || !!query;
  const clearAll = () => { setRenovar(false); setOnline(false); setAunATiempo(false); setDiasMax(null); setClasesMax(null); setQuery(""); };

  // Windowed initial paint (useRevealedWindow): the server + first hydration paint only the
  // opening window, then a mount effect reveals the full list below the fold. Filtering/
  // sorting/search still run over the FULL dataset from the first keystroke (that is `list`
  // above); only how many of `list` we paint is gated, and `list.length` — the header count —
  // stays exact. `revealAll` feeds the FLIP deps below, so the layout effect re-measures on the
  // reveal commit and the newly-mounted rows are captured without a spurious slide.
  const { visible, revealAll } = useRevealedWindow(list);

  // FLIP: animate rows to their new spot when the order/contents change.
  // `showFilters` is included not because it reorders rows, but because toggling
  // the filter panel shifts every row vertically; without re-measuring on that
  // commit, the next real reorder would compute deltas from stale pre-panel
  // rects and slide every row a spurious ~panel-height (FLIP fighting layout).
  // `revealAll` is a dep so the layout effect re-measures on the reveal commit,
  // capturing the newly-mounted rows' rects. Those rows have no "before" rect, so
  // they mount without a spurious slide; the initially-windowed rows keep their
  // exact positions (delta 0), so the reveal animates nothing.
  const flipRow = useFlip([sort, renovar, online, aunATiempo, diasMax, clasesMax, query, showFilters, revealAll]);

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
        {/* A RATIO, not a partition (#227): `N con paquete vigente de M`, both numbers
            from contarLifecycle — it can never disagree with the list below it the way
            three summed counts could (the old header's exact failure mode). No `activos`
            noun on a person: this names the PACKAGE's state. */}
        <div className="flex items-baseline" style={{ gap: 6, marginTop: 9, fontSize: 12.5, color: "var(--muted)" }}>
          <Tnum className="font-extrabold" style={{ fontSize: 16, color: "var(--green)", lineHeight: 1 }}>{conteos.vigentes}</Tnum>
          <span>con paquete vigente de</span>
          <Tnum style={{ color: "var(--fg)", fontWeight: 700 }}>{conteos.total}</Tnum>
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
            <div style={{ padding: "10px 16px 0" }}>
              <button
                onClick={() => setAunATiempo((v) => !v)}
                className="flex w-full items-center text-left"
                style={{ gap: 12, padding: "11px 13px", cursor: "pointer", background: aunATiempo ? "var(--warning-soft)" : "var(--surface)", border: `1px solid ${aunATiempo ? "var(--warning)" : "var(--line)"}` }}
              >
                <div className="flex shrink-0 items-center justify-center" style={{ width: 30, height: 30, background: aunATiempo ? "var(--warning)" : "transparent", border: aunATiempo ? "none" : "1px solid var(--line)" }}>
                  <Icon name="clock" size={15} color={aunATiempo ? "var(--canvas)" : "var(--warning)"} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="uppercase font-extrabold" style={{ fontSize: 13, letterSpacing: 0.5, color: "var(--fg)" }}>Aún a tiempo</div>
                  <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 1 }}>Vencieron hace poco, sin cuenta en la app</div>
                </div>
                <Tnum className="font-extrabold" style={{ fontSize: 22, lineHeight: 1, color: aunATiempo ? "var(--warning)" : "var(--fg)" }}>{aunATiempoCount}</Tnum>
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
          {/* A leading "Prioridad" chip NAMES the ruled order (actionable → current →
              expired) instead of leaving the default state unlabeled (#241): it lights
              up exactly when `sort` is null, the same single-active-button idiom the
              other three chips already use. Tapping it (from any named sort) clears
              back to `null` via the SAME toggle below — `s.k` is simply `null` here,
              so `cur === s.k` is the existing "tap active → clear" branch, never a
              second code path. Tapping one applies that sort; tapping the ACTIVE one
              again clears back to the ruled order (#227) — the same single-active-button
              feel as today, plus the "off" state. */}
          {([{ k: null, l: "Prioridad" }, { k: "dias", l: "Días" }, { k: "nombre", l: "A→Z" }, { k: "asist", l: "Asist." }] as const).map((s, i) => (
            <button
              key={s.l}
              onClick={() => setSort((cur) => (cur === s.k ? null : s.k))}
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
        {visible.map((f) => {
          const { c } = f;
          const col = urgencyColor(f.urgencia);
          const showBar = f.urgencia === "critico" || f.urgencia === "urgente";
          const clsLabel = c.clasesRestLabel;
          const bindingIsDias = f.vinculante === "dias";
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
                // Arm the in-app breadcrumb so the ficha's back button returns here
                // (restoring scroll) instead of risking a leave-the-app back.
                onClick={markInAppNav}
                // No explicit `prefetch`: this roster can be long and `prefetch`
                // (=== true) opts into a FULL-route prefetch of every in-viewport
                // row, each running getClienteFicha's ~7-call fan-out. The default
                // 'auto' partial-prefetch plus loading.tsx already make the tap
                // feel instant. Explicit prefetch is reserved for the singular
                // header CTA below.
                // COBRAR sits OUTSIDE this Link (sibling, not descendant): an <a>
                // may contain no interactive content, and AT should reach the
                // button as its own control.
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
                    {/* {n}D SIN VENIR (#229): quiet, never a tier/count/sort key — `f.ausente`
                        already carries the paid-up gate (clientes-vm.ts), so this component
                        makes no threshold decision of its own. */}
                    {f.ausente && (
                      <span
                        className="inline-flex items-center uppercase font-bold"
                        style={{ gap: 4, padding: "2px 6px", border: "1px solid var(--line-soft)", color: "var(--silver-dim)", fontSize: 8.5, letterSpacing: 0.9 }}
                      >
                        <Icon name="clock" size={9} color="var(--silver-dim)" />
                        <Tnum>{f.diasSinVenir}</Tnum>D SIN VENIR
                      </span>
                    )}
                  </div>
                </div>
              </Link>
              <div className="shrink-0" style={{ textAlign: "right", minWidth: 84, padding: "14px 22px 14px 0" }}>
                {/* The ESTADO column (#227): a fact about the PACKAGE, driven by the
                    unified engine — never a verdict on the person. Shown on every row,
                    including a pendienteOnline one below (a package fact still holds
                    even when the numeral area becomes COBRAR). */}
                <Badge state={c.veredicto.estado} style={{ padding: "2px 6px", fontSize: 8.5, letterSpacing: 0.8, marginBottom: 6 }} />
                {c.veredicto.pendienteOnline ? (
                  // Online-pending rows have meaningless días/clases zeros; swap the
                  // numbers for a one-tap COBRAR deep-link to Vender (#77).
                  <button
                    onClick={() => router.push(`/vender?cliente=${c.id}`)}
                    className="forge-pressable uppercase font-extrabold"
                    style={{ padding: "10px 14px", background: "transparent", color: "var(--fg)", border: "1px solid var(--silver-dim)", fontSize: 12, letterSpacing: 1.3, cursor: "pointer" }}
                  >
                    COBRAR
                  </button>
                ) : c.veredicto.estado === "vencido" && f.diasDesdeVencido !== null ? (
                  // VENCIDO (#227 AC): days-SINCE-expiry, always positive — never the raw
                  // negative diasRest a vigente/sin_clases row uses below. The caption is
                  // the expiry DATE (#227 F6), not the word "vencido" again — the badge
                  // right above already says that.
                  <>
                    <div className="flex items-baseline justify-end" style={{ gap: 3 }}>
                      <Tnum className="font-extrabold" style={{ fontSize: 17, lineHeight: 1, color: col }}>{f.diasDesdeVencido}</Tnum>
                      <span style={{ fontSize: 10, color: "var(--muted)" }}>{f.diasDesdeVencido === 1 ? "día" : "días"}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 4, letterSpacing: 0.3 }}><Tnum>{c.venceDisplay}</Tnum></div>
                  </>
                ) : bindingIsDias ? (
                  <>
                    <div className="flex items-baseline justify-end" style={{ gap: 3 }}>
                      <Tnum className="font-extrabold" style={{ fontSize: 17, lineHeight: 1, color: col }}>{diasNum(c)}</Tnum>
                      <span style={{ fontSize: 10, color: "var(--muted)" }}>{diasNum(c) === 1 ? "día" : "días"}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 4, letterSpacing: 0.3 }}><Tnum>{clsLabel}</Tnum> cl</div>
                  </>
                ) : (
                  <>
                    <div className="flex items-baseline justify-end" style={{ gap: 3 }}>
                      <Tnum className="font-extrabold" style={{ fontSize: 17, lineHeight: 1, color: col }}>{clsLabel}</Tnum>
                      <span style={{ fontSize: 10, color: "var(--muted)" }}>{c.veredicto.clases === 1 ? "clase" : "clases"}</span>
                    </div>
                    <div style={{ fontSize: 10.5, color: "var(--muted)", marginTop: 4, letterSpacing: 0.3 }}><Tnum>{diasNum(c)}</Tnum> d</div>
                  </>
                )}
              </div>
            </div>
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
