"use client";

import * as React from "react";
import Link from "next/link";
import { Icon } from "@gym/ui/forge/icon";
import { Sheet } from "@gym/ui/forge/sheet";
import { forgeToast } from "@gym/ui/forge/toaster";
import { Avatar, Card, Eyebrow, H1, Input, Tnum } from "@gym/ui/forge/ui";
import type { PaseClienteDTO } from "@gym/data/server/clientes";
import { addDays, DOW, firstName, fmtFull, isoDay, MON, parseDay, sameDay } from "@gym/format";
import { scrollBehavior } from "@gym/ui/motion";
import { markInAppNav } from "../../../../lib/nav";
import { togglePaseAction } from "../actions";
import { setMarcada, type Marcadas } from "./marcadas";

const DAYS_BACK = 104;

export function AsistenciaScreen({
  clientes,
  marcadas: marcadasInicial,
  hoyIso,
}: {
  clientes: PaseClienteDTO[];
  marcadas: Marcadas;
  hoyIso: string;
}) {
  const hoy = React.useMemo(() => parseDay(hoyIso), [hoyIso]);

  const [marcadas, setMarcadas] = React.useState<Marcadas>(marcadasInicial);
  // Mirror of `marcadas` for the toggle callback to read current presence at
  // call time WITHOUT closing over `marcadas` — that would change the callback
  // identity on every flip and defeat PaseRow's React.memo (re-rendering the
  // whole roster per tap). Kept in sync on every commit.
  const marcadasRef = React.useRef(marcadas);
  React.useEffect(() => {
    marcadasRef.current = marcadas;
  }, [marcadas]);
  const [selDate, setSelDate] = React.useState<Date>(() => parseDay(hoyIso));
  const [query, setQuery] = React.useState("");
  const [calOpen, setCalOpen] = React.useState(false);

  const selIso = isoDay(selDate);
  const presentes = marcadas[selIso] ?? [];
  const total = clientes.length;
  const count = presentes.length;
  const pct = total ? Math.round((count / total) * 100) : 0;
  const esHoy = sameDay(selDate, hoy);

  const filtered = clientes.filter((c) =>
    c.nombre.toLowerCase().includes(query.trim().toLowerCase()),
  );

  // Ids whose toggle is mid-flight, keyed by `${iso}:${id}`. A second tap on the
  // same row before the server answers is ignored, so the already-applied
  // optimistic flip stands instead of racing a competing action.
  const inFlight = React.useRef<Set<string>>(new Set());

  const toggle = React.useCallback(
    async (c: PaseClienteDTO) => {
      const key = `${selIso}:${c.id}`;
      if (inFlight.current.has(key)) return;
      inFlight.current.add(key);

      // Flip optimistically on this tick so the bounce, tint, avatar fill and
      // counts fire instantly; the server result reconciles below. Read the
      // current presence from the ref (not a closed-over `marcadas`) so this
      // callback stays referentially stable across flips.
      const willBePresent = !(marcadasRef.current[selIso] ?? []).includes(c.id);
      setMarcadas((m) => setMarcada(m, selIso, c.id, willBePresent));

      try {
        const res = await togglePaseAction({ clienteId: c.id, fecha: selIso });
        // Reconcile against the authoritative result (usually a no-op).
        setMarcadas((m) => setMarcada(m, selIso, c.id, res.present));
        if (res.present) {
          forgeToast({
            tone: "success",
            title: "Asistencia registrada",
            body: `${firstName(c.nombre)}${res.hora ? " · " + res.hora : ""}`,
          });
        }
      } catch {
        // Roll the optimistic flip back to its pre-tap value.
        setMarcadas((m) => setMarcada(m, selIso, c.id, !willBePresent));
        forgeToast({ tone: "warning", title: "No se pudo registrar", body: "Intenta de nuevo." });
      } finally {
        inFlight.current.delete(key);
      }
    },
    [selIso],
  );

  return (
    <div>
      {/* Header: title + live stat + calendar */}
      <div className="flex items-start justify-between" style={{ padding: "14px 22px 4px", gap: 8 }}>
        <div>
          <H1 size={38}>ASISTENCIA</H1>
          <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>
            <Tnum style={{ color: "var(--gold)", fontWeight: 700 }}>{count}</Tnum>{" "}
            {esHoy ? "hoy" : "registradas"} ·{" "}
            <Tnum>{total - count}</Tnum> pendientes
          </div>
        </div>
        <button
          onClick={() => setCalOpen(true)}
          aria-label="Abrir calendario"
          className="forge-hit forge-pressable flex shrink-0 items-center justify-center border bg-surface"
          style={{
            width: 38,
            height: 38,
            padding: 0,
            cursor: "pointer",
            borderColor: !esHoy ? "var(--yellow)" : "var(--line)",
          }}
        >
          <Icon name="cal" size={17} color={!esHoy ? "var(--gold)" : "var(--muted)"} />
        </button>
      </div>

      {/* Day strip */}
      <DayStrip hoy={hoy} marcadas={marcadas} selDate={selDate} onSelect={setSelDate} />

      {/* Progress hero */}
      <Card style={{ margin: "8px 16px 0" }}>
        <div className="flex items-center justify-between">
          <Eyebrow>REGISTRADOS</Eyebrow>
          <Tnum style={{ fontSize: 12, color: "var(--gold)", fontWeight: 800, letterSpacing: 0.5 }}>{pct}%</Tnum>
        </div>
        <div className="flex items-baseline" style={{ gap: 6, marginTop: 6 }}>
          <Tnum className="font-extrabold" style={{ fontSize: 44, lineHeight: 0.9, color: "var(--yellow)" }}>{count}</Tnum>
          <Tnum className="font-extrabold" style={{ fontSize: 26, color: "var(--muted)" }}>/ {total}</Tnum>
        </div>
        <div style={{ marginTop: 14, height: 3, background: "var(--line)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: "100%", background: "var(--yellow)", transform: `scaleX(${pct / 100})`, transformOrigin: "left", transition: "transform 380ms cubic-bezier(.32,.72,0,1)" }} />
        </div>
      </Card>

      {/* Search + add */}
      <div className="flex items-stretch" style={{ padding: "16px 16px 4px", gap: 8 }}>
        <Input icon="search" placeholder="Buscar cliente…" value={query} onChange={setQuery} style={{ flex: 1 }} />
        <Link
          href="/vender"
          prefetch
          aria-label="Registrar nuevo"
          className="forge-pressable flex shrink-0 items-center justify-center"
          style={{ width: 50, background: "var(--yellow)", color: "var(--ink)", cursor: "pointer" }}
        >
          <Icon name="plus" size={20} color="var(--ink)" />
        </Link>
      </div>

      {/* Client list */}
      <div style={{ paddingTop: 8 }}>
        {filtered.map((c, i) => (
          <PaseRow
            key={c.id}
            cliente={c}
            present={presentes.includes(c.id)}
            first={i === 0}
            onToggle={toggle}
          />
        ))}
        {filtered.length === 0 && (
          <div style={{ padding: "40px 22px", textAlign: "center", fontSize: 13, color: "var(--muted)" }}>
            Sin clientes que coincidan.
          </div>
        )}
      </div>

      <div style={{ height: 24 }} />

      <Sheet open={calOpen} onClose={() => setCalOpen(false)}>
        <PaseCalendar
          hoy={hoy}
          marcadas={marcadas}
          selDate={selDate}
          onPick={(d) => {
            setSelDate(d);
            setCalOpen(false);
          }}
        />
      </Sheet>
    </div>
  );
}

function DayStrip({
  hoy,
  marcadas,
  selDate,
  onSelect,
}: {
  hoy: Date;
  marcadas: Marcadas;
  selDate: Date;
  onSelect: (d: Date) => void;
}) {
  const scroller = React.useRef<HTMLDivElement>(null);
  const selRef = React.useRef<HTMLButtonElement>(null);
  const centered = React.useRef(false);

  const selKey = isoDay(selDate);
  // Center the selected day (today by default). Instant on first mount so
  // entering the screen doesn't animate a full-width scroll; smooth thereafter
  // on a user day-pick (always instant for reduced-motion users — scrollIntoView's
  // behavior is JS-driven, so the global CSS reduced-motion block can't reach it).
  React.useEffect(() => {
    selRef.current?.scrollIntoView({
      inline: "center",
      block: "nearest",
      behavior: centered.current ? scrollBehavior() : "auto",
    });
    centered.current = true;
  }, [selKey]);

  // Desktop click-drag to pan.
  const drag = React.useRef<{ x: number; left: number; on: boolean }>({ x: 0, left: 0, on: false });
  const onDown = (e: React.PointerEvent) => {
    if (!scroller.current) return;
    drag.current = { x: e.clientX, left: scroller.current.scrollLeft, on: true };
  };
  const onMove = (e: React.PointerEvent) => {
    if (!drag.current.on || !scroller.current) return;
    scroller.current.scrollLeft = drag.current.left - (e.clientX - drag.current.x);
  };
  const endDrag = () => (drag.current.on = false);

  const items: React.ReactNode[] = [];
  for (let off = -DAYS_BACK; off <= 0; off++) {
    const d = addDays(hoy, off);
    if (off === -DAYS_BACK || d.getDate() === 1) {
      items.push(
        <div key={`m${off}`} className="flex shrink-0 flex-col items-center justify-center" style={{ width: 30 }}>
          <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 1, color: "var(--muted-soft)" }}>{MON[d.getMonth()]}</span>
        </div>,
      );
    }
    const isSel = sameDay(d, selDate);
    const isToday = off === 0;
    const hasMarks = (marcadas[isoDay(d)]?.length ?? 0) > 0;
    items.push(
      <button
        key={`d${off}`}
        ref={isSel ? selRef : undefined}
        onClick={() => onSelect(d)}
        className="flex shrink-0 flex-col items-center"
        style={{
          width: 46,
          padding: "8px 0 6px",
          gap: 3,
          scrollSnapAlign: "center",
          background: isSel ? "var(--yellow)" : "transparent",
          border: `1px solid ${isSel ? "var(--yellow)" : isToday ? "var(--yellow-edge)" : "var(--line)"}`,
          color: isSel ? "var(--ink)" : "var(--fg)",
          cursor: "pointer",
          transition: "background-color 150ms cubic-bezier(.32,.72,0,1), border-color 150ms cubic-bezier(.32,.72,0,1)",
        }}
      >
        <span style={{ fontSize: 9, fontWeight: 700, letterSpacing: 0.6, color: isSel ? "var(--ink)" : "var(--muted)" }}>{DOW[d.getDay()]}</span>
        <Tnum style={{ fontSize: 16, fontWeight: 800, lineHeight: 1 }}>{d.getDate()}</Tnum>
        <span style={{ width: 4, height: 4, borderRadius: 999, background: hasMarks ? (isSel ? "var(--ink)" : "var(--gold)") : "transparent" }} />
      </button>,
    );
  }

  return (
    <div
      ref={scroller}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={endDrag}
      onPointerLeave={endDrag}
      className="forge-scroll flex cursor-grab overflow-x-auto active:cursor-grabbing"
      style={{ gap: 6, padding: "10px 16px 2px", scrollSnapType: "x proximity" }}
    >
      {items}
    </div>
  );
}

const PaseRow = React.memo(function PaseRow({
  cliente,
  present,
  first,
  onToggle,
}: {
  cliente: PaseClienteDTO;
  present: boolean;
  first: boolean;
  onToggle: (c: PaseClienteDTO) => void;
}) {
  const c = cliente;
  return (
    <div
      onClick={() => onToggle(c)}
      className="forge-pressable flex w-full items-center select-none"
      style={{
        gap: 14,
        padding: "12px 22px",
        borderTop: first ? "1px solid var(--line)" : "none",
        borderBottom: "1px solid var(--line)",
        cursor: "pointer",
        background: present ? "var(--yellow-soft)" : "transparent",
        transition: "background-color 180ms cubic-bezier(.32,.72,0,1)",
      }}
    >
      <Avatar initial={c.inicial} size={40} accent={present} />
      <Link
        href={`/clientes/${c.id}`}
        // No explicit `prefetch`: one per roster row would FULL-prefetch every
        // in-viewport client's ~7-call ficha route. Default 'auto' partial
        // prefetch + loading.tsx keep the tap instant. (Matches clientes.tsx.)
        // Stop the tap bubbling to the row (which would toggle attendance), and
        // arm the in-app breadcrumb so the ficha back returns here (see lib/nav).
        onClick={(e) => {
          e.stopPropagation();
          markInAppNav();
        }}
        className="min-w-0 flex-1 text-left"
        style={{ background: "transparent", border: "none", cursor: "pointer", color: "var(--fg)" }}
      >
        <div className="uppercase font-semibold" style={{ fontSize: 14, letterSpacing: 0.4 }}>{c.nombre}</div>
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>
          {c.paquete} · {c.clasesLabel}
          {c.porVencer && <span style={{ color: "var(--gold)", fontWeight: 700 }}> · VENCE {c.diasRest}D</span>}
        </div>
      </Link>
      <div
        className="flex shrink-0 items-center justify-center"
        style={{
          width: 28,
          height: 28,
          background: present ? "var(--yellow)" : "transparent",
          border: `1.5px solid ${present ? "var(--yellow)" : "var(--muted-soft)"}`,
          transition: "background-color 180ms cubic-bezier(.32,.72,0,1), border-color 180ms cubic-bezier(.32,.72,0,1)",
        }}
      >
        {/* Check mark scales/fades both ways so uncheck mirrors check (forge-pop
            on entry; a symmetric scale-down + fade on exit). */}
        <span
          aria-hidden
          className="flex items-center justify-center"
          style={{
            transformOrigin: "center",
            transform: present ? "scale(1)" : "scale(0.4)",
            opacity: present ? 1 : 0,
            animation: present ? "forge-pop 280ms cubic-bezier(.32,.72,0,1)" : "none",
            transition: "transform 160ms cubic-bezier(.32,.72,0,1), opacity 160ms cubic-bezier(.32,.72,0,1)",
          }}
        >
          <Icon name="check" size={16} color="var(--ink)" />
        </span>
      </div>
    </div>
  );
});

function PaseCalendar({
  hoy,
  marcadas,
  selDate,
  onPick,
}: {
  hoy: Date;
  marcadas: Marcadas;
  selDate: Date;
  onPick: (d: Date) => void;
}) {
  const [view, setView] = React.useState({ y: selDate.getFullYear(), m: selDate.getMonth() });

  const first = new Date(view.y, view.m, 1);
  const lead = first.getDay();
  const daysInMonth = new Date(view.y, view.m + 1, 0).getDate();
  const atCurrentMonth = view.y === hoy.getFullYear() && view.m === hoy.getMonth();

  const cells: (Date | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(view.y, view.m, d));

  const stepMonth = (delta: number) => {
    const next = new Date(view.y, view.m + delta, 1);
    if (next > hoy) return;
    setView({ y: next.getFullYear(), m: next.getMonth() });
  };

  const selCount = (marcadas[isoDay(selDate)]?.length ?? 0);

  return (
    <div style={{ padding: "8px 18px 6px" }}>
      {/* month nav */}
      <div className="flex items-center justify-between" style={{ padding: "6px 2px 14px" }}>
        <button onClick={() => stepMonth(-1)} aria-label="Mes anterior" className="forge-hit forge-pressable flex items-center justify-center border border-line bg-surface" style={{ width: 34, height: 34, cursor: "pointer" }}>
          <Icon name="back" size={16} color="var(--fg)" />
        </button>
        <div className="uppercase font-extrabold" style={{ fontSize: 15, letterSpacing: 1 }}>
          {MON[view.m]} {view.y}
        </div>
        <button
          onClick={() => stepMonth(1)}
          disabled={atCurrentMonth}
          aria-label="Mes siguiente"
          className="forge-hit forge-pressable flex items-center justify-center border border-line bg-surface"
          style={{ width: 34, height: 34, cursor: atCurrentMonth ? "not-allowed" : "pointer", opacity: atCurrentMonth ? 0.35 : 1 }}
        >
          <Icon name="chev" size={16} color="var(--fg)" />
        </button>
      </div>

      {/* weekday header */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(7, 1fr)", gap: 4, marginBottom: 4 }}>
        {DOW.map((d) => (
          <div key={d} style={{ textAlign: "center", fontSize: 9, fontWeight: 700, color: "var(--muted)", letterSpacing: 0.5 }}>{d}</div>
        ))}
      </div>

      {/* days */}
      <div className="grid" style={{ gridTemplateColumns: "repeat(7, 1fr)", gap: 4 }}>
        {cells.map((d, i) => {
          if (!d) return <div key={`b${i}`} />;
          const future = d > hoy;
          const isSel = sameDay(d, selDate);
          const isToday = sameDay(d, hoy);
          const has = (marcadas[isoDay(d)]?.length ?? 0) > 0;
          return (
            <button
              key={isoDay(d)}
              onClick={() => !future && onPick(d)}
              disabled={future}
              className="relative flex aspect-square items-center justify-center"
              style={{
                background: isSel ? "var(--yellow)" : "transparent",
                border: `1px solid ${isSel ? "var(--yellow)" : isToday ? "var(--yellow-edge)" : "var(--line)"}`,
                color: isSel ? "var(--ink)" : future ? "var(--muted-soft)" : "var(--fg)",
                cursor: future ? "default" : "pointer",
                transition: "background-color 150ms cubic-bezier(.32,.72,0,1), border-color 150ms cubic-bezier(.32,.72,0,1)",
              }}
            >
              <Tnum style={{ fontSize: 14, fontWeight: 700 }}>{d.getDate()}</Tnum>
              {has && !isSel && (
                <span className="absolute" style={{ bottom: 4, width: 4, height: 4, borderRadius: 999, background: "var(--gold)" }} />
              )}
            </button>
          );
        })}
      </div>

      {/* footer */}
      <div className="flex items-center justify-between" style={{ marginTop: 16, paddingTop: 14, borderTop: "1px solid var(--line)" }}>
        <div>
          <div className="uppercase" style={{ fontSize: 13, fontWeight: 700, letterSpacing: 0.4 }}>{fmtFull(selDate)}</div>
          <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>
            <Tnum style={{ color: "var(--gold)", fontWeight: 700 }}>{selCount}</Tnum> asistencias registradas
          </div>
        </div>
        <button
          onClick={() => onPick(hoy)}
          className="forge-pressable uppercase font-extrabold"
          style={{ padding: "10px 16px", background: "var(--yellow)", color: "var(--ink)", fontSize: 12, letterSpacing: 1, cursor: "pointer" }}
        >
          HOY
        </button>
      </div>
    </div>
  );
}
