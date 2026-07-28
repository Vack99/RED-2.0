"use client";

/* PROTOTYPE D — "Puerta", round 2. C's structure won but its add-by-typing was the
   bottleneck, so the FULL member list is the screen: tappable, scoped by a one-line
   pill selector thinner than A's chips. Round-2 verdict applied:
   — The inline roster block is GONE. It was a second rendering of what the list
     already shows; its two jobs moved into the rows themselves (arrival hora next
     to the check, tap-again to undo that visit).
   — Members who BOOKED the selected class lead the list as a `CON RESERVA` group
     (PushPress/Wodify: the class roster IS the reserved list). Group membership is
     the booking, not the attendance state, so a marked row stays put — the list
     never reorders under the operator's thumb.
   One number survives — presentes in the selected context, on the sticky bar.
   Throwaway (#89). */

import * as React from "react";
import type { PaseClienteDTO } from "@gym/data/server/clientes";
import { Icon } from "@gym/ui/forge/icon";
import { Avatar, Eyebrow, H1, Input, Tnum } from "@gym/ui/forge/ui";
import { useRevealedWindow } from "@gym/ui/forge/use-revealed-window";

import type { SesionProto } from "../../prototype-sesiones";
import { Aviso, enCtx, LIBRE, reservasPorSesion, sesionCercana, useMarcasProto, type Marca } from "./shared";

export const NOMBRE = "Puerta (lista + selector fino)";

export function VariantDPuerta({
  clientes,
  sesiones,
  marcadasHoy,
  reservas,
}: {
  clientes: PaseClienteDTO[];
  sesiones: SesionProto[];
  marcadasHoy: string[];
  /** sessionId → clienteIds holding a `reservada`/`asistida` booking (real data). */
  reservas: Record<string, string[]>;
}) {
  // Zen Planner's kiosk rule: open on the class nearest now, else open access.
  const [ctx, setCtx] = React.useState<string>(() => sesionCercana(sesiones));
  const [query, setQuery] = React.useState("");
  const { marcas, marcar, quitar } = useMarcasProto(marcadasHoy);

  const actual = sesiones.find((s) => s.id === ctx); // undefined ⇒ ACCESO LIBRE

  // Bookings per session — real where they exist, a labelled stand-in where the
  // live data has none (today every gym has zero; see reservasPorSesion).
  const { porSesion, simulado } = React.useMemo(
    () => reservasPorSesion(sesiones, clientes, reservas),
    [sesiones, clientes, reservas],
  );
  const reservados = React.useMemo(() => new Set(porSesion[ctx] ?? []), [porSesion, ctx]);

  const enEste = enCtx(marcas, ctx);

  const etiquetaCorta = (k: string) =>
    k === LIBRE ? "LIBRE" : (sesiones.find((s) => s.id === k)?.tipo ?? "—");

  // Tap a member: mark in the current context, or — same gesture — undo that visit
  // (Wodify's "click again to undo a sign-in"). The toggle discipline means a member
  // holds at most one visit per context, so the undo is exactly per-visit.
  const tapCliente = (c: PaseClienteDTO) => {
    const mias = enEste.filter((m) => m.clienteId === c.id);
    if (mias.length > 0) quitar(mias[mias.length - 1].id);
    else marcar(c.id, ctx);
  };

  const filtered = clientes.filter((c) => c.nombre.toLowerCase().includes(query.trim().toLowerCase()));
  // Booked lead the list; both halves keep the roster's alphabetical order and a row
  // NEVER moves when marked — group membership is the booking, not the check.
  const conReserva = filtered.filter((c) => reservados.has(c.id));
  const sinReserva = filtered.filter((c) => !reservados.has(c.id));
  // Windowed initial paint so a 250-member gym doesn't pay for the full list up front.
  const { visible: restoVisible } = useRevealedWindow(sinReserva);

  const fila = (c: PaseClienteDTO) => {
    const mias = enEste.filter((m) => m.clienteId === c.id);
    return (
      <FilaCliente
        key={c.id}
        cliente={c}
        marcado={mias.length > 0}
        hora={mias.length > 0 ? mias[mias.length - 1].hora : null}
        otras={marcas.filter((m) => m.clienteId === c.id && m.ctx !== ctx)}
        etiqueta={etiquetaCorta}
        onTap={() => tapCliente(c)}
      />
    );
  };

  return (
    <div>
      <Aviso />

      {/* Header: the title and nothing else — every count A/C stacked here is cut. */}
      <div style={{ padding: "14px 22px 10px" }}>
        <H1 size={38}>ASISTENCIA</H1>
      </div>

      {/* Sticky context block: the thin selector + the one number. */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 10,
          background: "var(--canvas)",
          borderBottom: "1px solid var(--line)",
        }}
      >
        {/* One-line pills — the "thinner than A" selector. A context with marks gets a
            dot (the day strip's has-marks idiom), never a count. With no schedule the
            row doesn't render at all: the screen is ACCESO LIBRE + list, intentional. */}
        {sesiones.length > 0 && (
          <div
            className="forge-scroll flex overflow-x-auto"
            style={{ gap: 6, padding: "4px 16px 8px", scrollSnapType: "x proximity" }}
          >
            {[{ id: LIBRE, hora: "", tipo: "ACCESO LIBRE" }, ...sesiones].map((s) => {
              const on = s.id === ctx;
              const n = enCtx(marcas, s.id).length;
              return (
                <button
                  key={s.id}
                  onClick={() => setCtx(s.id)}
                  className="flex shrink-0 items-center uppercase"
                  style={{
                    gap: 6,
                    padding: "8px 12px",
                    scrollSnapAlign: "start",
                    background: on ? "var(--yellow)" : "transparent",
                    border: `1px solid ${on ? "var(--yellow)" : "var(--line)"}`,
                    color: on ? "var(--ink)" : "var(--fg)",
                    cursor: "pointer",
                    whiteSpace: "nowrap",
                    transition:
                      "background-color 150ms cubic-bezier(.32,.72,0,1), border-color 150ms cubic-bezier(.32,.72,0,1)",
                  }}
                >
                  {s.hora && (
                    <Tnum style={{ fontSize: 10, fontWeight: 800, opacity: on ? 0.7 : 1, color: on ? "var(--ink)" : "var(--muted)" }}>
                      {s.hora}
                    </Tnum>
                  )}
                  <span style={{ fontSize: 11, fontWeight: 800, letterSpacing: 0.6 }}>{s.tipo}</span>
                  {n > 0 && (
                    <span
                      style={{ width: 4, height: 4, borderRadius: 999, background: on ? "var(--ink)" : "var(--gold)" }}
                    />
                  )}
                </button>
              );
            })}
          </div>
        )}

        {/* The ONE number: presentes in this context (against cupo for a class). */}
        <div className="flex items-baseline justify-between" style={{ gap: 8, padding: "8px 22px 10px" }}>
          <div className="flex items-baseline" style={{ gap: 7 }}>
            {actual && <Tnum style={{ fontSize: 12, fontWeight: 800, color: "var(--gold)" }}>{actual.hora}</Tnum>}
            <span className="uppercase" style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.8 }}>
              {actual ? actual.tipo : "ACCESO LIBRE"}
            </span>
          </div>
          <div className="flex items-baseline" style={{ gap: 3 }}>
            <Tnum style={{ fontSize: 17, fontWeight: 800, lineHeight: 1, color: "var(--gold)" }}>{enEste.length}</Tnum>
            {actual && (
              <Tnum style={{ fontSize: 11.5, fontWeight: 700, color: "var(--muted)" }}>/ {actual.capacidad}</Tnum>
            )}
          </div>
        </div>
      </div>

      {/* Search is a FILTER over the list, never the path to it (Zen Planner's lesson). */}
      <div style={{ padding: "12px 16px 4px" }}>
        <Input icon="search" placeholder="Filtrar…" value={query} onChange={setQuery} />
      </div>

      {/* The list. In a class context the members who BOOKED it lead — they're the
          operator's working set when the class starts. Marking someone changes their
          row in place (tint + check + hora), never their position. */}
      <div style={{ paddingTop: 4 }}>
        {conReserva.length > 0 && (
          <>
            <div className="flex items-baseline justify-between" style={{ gap: 8, padding: "12px 22px 8px" }}>
              <div className="flex items-baseline" style={{ gap: 7 }}>
                <Eyebrow>CON RESERVA</Eyebrow>
                <Tnum style={{ fontSize: 11, fontWeight: 800, color: "var(--gold)" }}>{conReserva.length}</Tnum>
              </div>
              {/* The live database has no bookings for today, so these are synthesized
                  to make the affordance judgeable — never presented as real. */}
              {simulado && (
                <span
                  className="uppercase"
                  style={{ fontSize: 8.5, fontWeight: 700, letterSpacing: 1, color: "var(--muted-soft)" }}
                >
                  Reservas simuladas
                </span>
              )}
            </div>
            <div style={{ borderTop: "1px solid var(--line)" }}>{conReserva.map(fila)}</div>
            <div style={{ padding: "16px 22px 8px" }}>
              <Eyebrow>SIN RESERVA</Eyebrow>
            </div>
          </>
        )}
        <div style={{ borderTop: "1px solid var(--line)" }}>{restoVisible.map(fila)}</div>
        {filtered.length === 0 && (
          <div style={{ padding: "40px 22px", textAlign: "center", fontSize: 13, color: "var(--muted)" }}>
            Sin clientes que coincidan.
          </div>
        )}
      </div>

      <div style={{ height: 140 }} />
    </div>
  );
}

/** One member row. Sub-line = membership + today's visits in OTHER contexts (one gold
 *  stamp per visit — never a ×2). The right cluster = THIS context: arrival hora when
 *  marked (the old roster block's timestamp, relocated) + the check. */
function FilaCliente({
  cliente: c,
  marcado,
  hora,
  otras,
  etiqueta,
  onTap,
}: {
  cliente: PaseClienteDTO;
  marcado: boolean;
  /** Arrival "HH:MM" in the current context, or null when unmarked; "—" for a seeded
   *  row whose hora we didn't fetch (rendered as no stamp — the check already says it). */
  hora: string | null;
  otras: Marca[];
  etiqueta: (ctx: string) => string;
  onTap: () => void;
}) {
  return (
    <div
      onClick={onTap}
      className="forge-pressable flex w-full items-center select-none"
      style={{
        gap: 14,
        padding: "12px 22px",
        borderBottom: "1px solid var(--line)",
        cursor: "pointer",
        background: marcado ? "var(--yellow-soft)" : "transparent",
        transition: "background-color 180ms cubic-bezier(.32,.72,0,1)",
      }}
    >
      <Avatar initial={c.inicial} size={40} accent={marcado} />
      <div className="min-w-0 flex-1">
        <div className="uppercase font-semibold" style={{ fontSize: 14, letterSpacing: 0.4 }}>
          {c.nombre}
        </div>
        <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>
          {c.clasesLabel}
          {c.porVencer && <span style={{ color: "var(--gold)", fontWeight: 700 }}> · VENCE {c.diasRest}D</span>}
          {otras.map((m) => (
            <span key={m.id} className="uppercase" style={{ color: "var(--gold)", fontWeight: 700 }}>
              {" · "}
              {m.hora === "—" ? etiqueta(m.ctx) : `${m.hora} ${etiqueta(m.ctx)}`}
            </span>
          ))}
        </div>
      </div>
      <div className="flex shrink-0 items-center" style={{ gap: 8 }}>
        {marcado && hora !== null && hora !== "—" && (
          <Tnum style={{ fontSize: 11, fontWeight: 700, color: "var(--gold)" }}>{hora}</Tnum>
        )}
        <div
          className="flex items-center justify-center"
          style={{
            width: 28,
            height: 28,
            background: marcado ? "var(--yellow)" : "transparent",
            border: `1.5px solid ${marcado ? "var(--yellow)" : "var(--muted-soft)"}`,
            transition:
              "background-color 180ms cubic-bezier(.32,.72,0,1), border-color 180ms cubic-bezier(.32,.72,0,1)",
          }}
        >
          <span
            aria-hidden
            className="flex items-center justify-center"
            style={{
              transformOrigin: "center",
              transform: marcado ? "scale(1)" : "scale(0.4)",
              opacity: marcado ? 1 : 0,
              animation: marcado ? "forge-pop 280ms cubic-bezier(.32,.72,0,1)" : "none",
              transition: "transform 160ms cubic-bezier(.32,.72,0,1), opacity 160ms cubic-bezier(.32,.72,0,1)",
            }}
          >
            <Icon name="check" size={16} color="var(--ink)" />
          </span>
        </div>
      </div>
    </div>
  );
}
