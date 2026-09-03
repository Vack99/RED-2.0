"use client";

import * as React from "react";

import { Icon } from "../icon";
import { Avatar, Eyebrow, Input, Tnum } from "../ui";

/**
 * The session roster inside the quick-glance sheet (slice #60): the booked members of
 * one class, each with a Pasar lista present-toggle, plus an "Agregar" walk-in picker
 * over the gym's other clientes. Reuses the exact pase-de-lista idiom from the
 * ASISTENCIA screen — Avatar + a yellow present box + a yellow-soft row — so the mark
 * gesture is the one operators already know. Token-only; all state (present flips,
 * walk-in adds) is driven by the parent through callbacks.
 *
 * A booked member still unmarked once their arrival window closed reads as a quiet THIRD
 * state — dimmed, with a "NO ASISTIÓ" caption. It is derived at read, never stored, so
 * the same single tap that marks anyone else supersedes it (ruling 2026-07-29).
 *
 * ONE add affordance, whose verb follows the TENSE (#238, boundary moved by the owner ruling
 * of 2026-09-02): AGREGAR RESERVA until the class starts, AGREGAR VISITA from its start on.
 * The component only renders that tense — the write path behind the tap is the parent's,
 * decided against a clock read at tap time. A booked-not-present row also gets the operator's
 * cancel, because a phone booking charges the member the instant it is made.
 *
 * When that add is refused for a reason a SALE fixes, the parent hands back `ventaSugerida` and
 * the picker grows a persistent line to Vender for that member (#235 story 10) — the caller is
 * still on the line, and the toast that named the reason is already gone.
 */

export interface RosterRow {
  clienteId: string;
  nombre: string;
  inicial: string;
  paquete: string;
  present: boolean;
  isWalkIn: boolean;
  /** Booked, never marked, arrival window closed — derived at read, never stored. */
  noAsistio: boolean;
}

export interface CandidateRow {
  id: string;
  nombre: string;
  inicial: string;
  paquete: string;
}

/** A pick the RPC refused for a reason a sale fixes, and where to go fix it (#235 story 10).
 *  `href` arrives PREBUILT — routes are the app's knowledge, never this kit's. */
export interface VentaSugerida {
  nombre: string;
  href: string;
}

/** "3/5 presentes" — the roster headline. `total` counts every booked member + walk-in
 *  on the list; `presentes` those actually marked. Pure — tested in session-roster.test.ts. */
export function rosterResumen(rows: Pick<RosterRow, "present">[]): { presentes: number; total: number } {
  return { presentes: rows.filter((r) => r.present).length, total: rows.length };
}

/**
 * The add-button verb and the empty-state line, both derived from the SAME tense so the two
 * can never contradict each other (#238): the tap books a reserva until the class STARTS, and
 * records an arrival from then on (owner ruling 2026-09-02 — an early arrival is booked, then
 * marked present, rather than being un-bookable for the last 90 minutes). The label may lag a
 * class that started while the sheet sat there — deliberately: the WRITE re-reads the clock at
 * tap time (the parent's handler), so a stale label is cosmetic and a stale write is impossible.
 */
export function copiaAgregar(antesDeInicio: boolean): { boton: string; vacio: string } {
  const que = antesDeInicio ? "reserva" : "visita";
  return { boton: `Agregar ${que}`, vacio: `Nadie reservó todavía · agrega una ${que}` };
}

/**
 * Whether a roster row gets the operator's cancel affordance: a reserva still awaiting its
 * member, on a class that has not started. A row already marked present does not — removing
 * THAT is what the present-toggle already does.
 *
 * `claseIniciada` is `now >= startsAt`, and it is the RPC's OWN gate (ADR-0010 §4: once the
 * class has begun a still-reservada booking is a no-show that must consume, not a refundable
 * cancel). It is deliberately NOT `noAsistio`: that flips at the window's CLOSE — 15 min after
 * the class ENDS — which for a 60-min class would leave a 75-minute band where the × renders
 * and every tap comes back "La clase ya comenzó". The RPC stays the enforcer; hiding is
 * cosmetic, so a render-stale value here is acceptable exactly as the label's is.
 */
export function puedeCancelarReserva(row: Pick<RosterRow, "present">, claseIniciada: boolean): boolean {
  return !row.present && !claseIniciada;
}

export interface SessionRosterProps {
  rows: RosterRow[];
  candidates: CandidateRow[];
  loading: boolean;
  /** clienteIds with a mark/add in flight — their row shows a pending affordance. */
  busy: Set<string>;
  /** `now >= startsAt`. ONE bit, two jobs: it hides the cancel × once the RPC would refuse it,
   *  and its negation is the #238 add-tense. Copy only — the parent re-derives the tense against
   *  a fresh clock inside `onAddWalkIn` to choose the write. */
  claseIniciada: boolean;
  /** The last add the RPC refused over balance/vigencia (#235 story 10). Omit for no line. */
  ventaSugerida?: VentaSugerida;
  onToggle: (clienteId: string) => void;
  onAddWalkIn: (clienteId: string) => void;
  /** Remove a booked-not-present member's reserva (refunds the class). Omit for no affordance. */
  onCancelReserva?: (clienteId: string) => void;
}

export function SessionRoster({
  rows,
  candidates,
  loading,
  busy,
  claseIniciada,
  ventaSugerida,
  onToggle,
  onAddWalkIn,
  onCancelReserva,
}: SessionRosterProps) {
  const [adding, setAdding] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const { presentes, total } = rosterResumen(rows);
  const copia = copiaAgregar(!claseIniciada);
  const q = query.trim().toLowerCase();
  const matches = q ? candidates.filter((c) => c.nombre.toLowerCase().includes(q)) : candidates;

  return (
    <div style={{ marginTop: 26 }}>
      <div className="flex items-baseline justify-between">
        <Eyebrow>Lista</Eyebrow>
        {!loading && total > 0 && (
          <Tnum style={{ fontSize: 12, fontWeight: 800, letterSpacing: -0.2, color: "var(--fg)" }}>
            {presentes}/{total} presentes
          </Tnum>
        )}
      </div>

      {loading ? (
        <div style={{ padding: "22px 2px", fontSize: 12, color: "var(--muted)" }}>Cargando lista…</div>
      ) : (
        <>
          <div style={{ marginTop: 10 }}>
            {rows.length === 0 ? (
              <div style={{ padding: "16px 2px", fontSize: 12.5, color: "var(--muted)" }}>{copia.vacio}</div>
            ) : (
              rows.map((r) => (
                <RosterRowView
                  key={r.clienteId}
                  row={r}
                  busy={busy.has(r.clienteId)}
                  claseIniciada={claseIniciada}
                  onToggle={onToggle}
                  onCancelReserva={onCancelReserva}
                />
              ))
            )}
          </div>

          {/* The blocked pick's one tap to the sale (#235 story 10). PERSISTENT, unlike the toast
              that named the reason: the operator is reading the caller their options, and by the
              time they decide the toast is long gone. Sits ABOVE the add affordance so it stands
              whether the picker is open or shut, and the parent clears it on the next pick. */}
          {ventaSugerida && (
            <div
              className="flex items-center justify-between"
              style={{
                marginTop: 12, gap: 10, padding: "9px 10px",
                background: "var(--yellow-soft)", border: "1px solid var(--yellow-edge)",
              }}
            >
              <span style={{ minWidth: 0, fontSize: 11.5, letterSpacing: 0.2, color: "var(--fg)" }}>
                <span className="uppercase font-semibold">{ventaSugerida.nombre}</span> necesita un paquete
              </span>
              <a
                href={ventaSugerida.href}
                className="forge-pressable uppercase shrink-0"
                style={{ fontSize: 10.5, fontWeight: 800, letterSpacing: 1.2, color: "var(--gold)", textDecoration: "none" }}
              >
                Vender
              </a>
            </div>
          )}

          {adding ? (
            <div style={{ marginTop: 12 }}>
              <Input icon="search" placeholder="Buscar cliente…" value={query} onChange={setQuery} autoFocus />
              <div style={{ marginTop: 6, maxHeight: 220, overflowY: "auto" }} className="forge-scroll">
                {matches.length === 0 ? (
                  <div style={{ padding: "16px 2px", fontSize: 12.5, color: "var(--muted)" }}>Sin clientes que coincidan.</div>
                ) : (
                  matches.map((c) => (
                    <button
                      key={c.id}
                      type="button"
                      disabled={busy.has(c.id)}
                      onClick={() => onAddWalkIn(c.id)}
                      className="forge-pressable flex w-full items-center"
                      style={{
                        gap: 12,
                        padding: "10px 2px",
                        borderBottom: "1px solid var(--line)",
                        background: "transparent",
                        border: "none",
                        cursor: busy.has(c.id) ? "default" : "pointer",
                        opacity: busy.has(c.id) ? 0.5 : 1,
                        textAlign: "left",
                      }}
                    >
                      <Avatar initial={c.inicial} size={34} />
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div className="uppercase font-semibold" style={{ fontSize: 13, letterSpacing: 0.3, color: "var(--fg)" }}>{c.nombre}</div>
                        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{c.paquete}</div>
                      </div>
                      <Icon name="plus" size={16} color="var(--gold)" />
                    </button>
                  ))
                )}
              </div>
              <button
                type="button"
                onClick={() => { setAdding(false); setQuery(""); }}
                className="forge-pressable uppercase"
                style={{ marginTop: 10, padding: "8px 0", background: "transparent", border: "none", color: "var(--muted)", fontSize: 11, fontWeight: 700, letterSpacing: 1, cursor: "pointer" }}
              >
                Cerrar
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setAdding(true)}
              className="forge-pressable flex items-center justify-center uppercase"
              style={{
                marginTop: 14, width: "100%", gap: 8, padding: "12px 0",
                background: "transparent", border: "1px solid var(--line)", color: "var(--fg)",
                fontSize: 11.5, fontWeight: 800, letterSpacing: 1.2, cursor: "pointer",
              }}
            >
              <Icon name="plus" size={15} color="var(--gold)" />
              {copia.boton}
            </button>
          )}
        </>
      )}
    </div>
  );
}

const RosterRowView = React.memo(function RosterRowView({
  row,
  busy,
  claseIniciada,
  onToggle,
  onCancelReserva,
}: {
  row: RosterRow;
  busy: boolean;
  claseIniciada: boolean;
  onToggle: (clienteId: string) => void;
  onCancelReserva?: (clienteId: string) => void;
}) {
  const cancelable = onCancelReserva !== undefined && puedeCancelarReserva(row, claseIniciada);
  return (
    <div
      onClick={() => !busy && onToggle(row.clienteId)}
      className="forge-pressable flex w-full items-center select-none"
      style={{
        gap: 12,
        padding: "11px 2px",
        borderBottom: "1px solid var(--line)",
        cursor: busy ? "default" : "pointer",
        background: row.present ? "var(--yellow-soft)" : "transparent",
        // The third state is QUIET: a dimmed row and a caption, never a red badge. The
        // roster is glanced at during class, and a coach's mark supersedes it with the
        // same single tap — this is a reading, not an accusation.
        opacity: row.noAsistio ? 0.55 : 1,
        transition: "background-color 180ms cubic-bezier(.32,.72,0,1), opacity 180ms cubic-bezier(.32,.72,0,1)",
      }}
    >
      <Avatar initial={row.inicial} size={38} accent={row.present} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="flex items-center" style={{ gap: 7 }}>
          <span className="uppercase font-semibold" style={{ fontSize: 13.5, letterSpacing: 0.3, color: "var(--fg)" }}>{row.nombre}</span>
          {row.isWalkIn && (
            <span className="uppercase" style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.8, color: "var(--gold)", border: "1px solid var(--yellow-edge)", padding: "1px 4px" }}>
              Sin reserva
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>
          {row.paquete}
          {row.noAsistio && (
            <span className="uppercase" style={{ fontWeight: 700, letterSpacing: 0.5 }}> · No asistió</span>
          )}
        </div>
      </div>
      {/* The operator's undo (#235): charging is at booking, so a mis-tapped name has cost a
          member a class that only this gives back. Quiet and small — it sits beside the mark
          box, never replacing it, and stops the row's own toggle from firing underneath. */}
      {cancelable && (
        <button
          type="button"
          disabled={busy}
          aria-label={`Cancelar la reserva de ${row.nombre}`}
          onClick={(e) => {
            e.stopPropagation();
            onCancelReserva?.(row.clienteId);
          }}
          className="forge-pressable flex shrink-0 items-center justify-center"
          style={{
            width: 26, height: 26, marginRight: 2,
            background: "transparent", border: "1px solid var(--line)",
            cursor: busy ? "default" : "pointer",
          }}
        >
          <Icon name="close" size={12} color="var(--muted)" />
        </button>
      )}
      <div
        className="flex shrink-0 items-center justify-center"
        style={{
          width: 26, height: 26,
          background: row.present ? "var(--yellow)" : "transparent",
          border: `1.5px solid ${row.present ? "var(--yellow)" : "var(--muted-soft)"}`,
          transition: "background-color 180ms cubic-bezier(.32,.72,0,1), border-color 180ms cubic-bezier(.32,.72,0,1)",
        }}
      >
        <span
          aria-hidden
          className="flex items-center justify-center"
          style={{
            transform: row.present ? "scale(1)" : "scale(0.4)",
            opacity: row.present ? 1 : 0,
            transition: "transform 160ms cubic-bezier(.32,.72,0,1), opacity 160ms cubic-bezier(.32,.72,0,1)",
          }}
        >
          <Icon name="check" size={15} color="var(--ink)" />
        </span>
      </div>
    </div>
  );
});
