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
 */

export interface RosterRow {
  clienteId: string;
  nombre: string;
  inicial: string;
  paquete: string;
  present: boolean;
  isWalkIn: boolean;
}

export interface CandidateRow {
  id: string;
  nombre: string;
  inicial: string;
  paquete: string;
}

/** "3/5 presentes" — the roster headline. `total` counts every booked member + walk-in
 *  on the list; `presentes` those actually marked. Pure — tested in session-roster.test.ts. */
export function rosterResumen(rows: Pick<RosterRow, "present">[]): { presentes: number; total: number } {
  return { presentes: rows.filter((r) => r.present).length, total: rows.length };
}

export interface SessionRosterProps {
  rows: RosterRow[];
  candidates: CandidateRow[];
  loading: boolean;
  /** clienteIds with a mark/add in flight — their row shows a pending affordance. */
  busy: Set<string>;
  onToggle: (clienteId: string) => void;
  onAddWalkIn: (clienteId: string) => void;
}

export function SessionRoster({ rows, candidates, loading, busy, onToggle, onAddWalkIn }: SessionRosterProps) {
  const [adding, setAdding] = React.useState(false);
  const [query, setQuery] = React.useState("");

  const { presentes, total } = rosterResumen(rows);
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
              <div style={{ padding: "16px 2px", fontSize: 12.5, color: "var(--muted)" }}>
                Nadie reservó todavía · agrega un walk-in
              </div>
            ) : (
              rows.map((r) => (
                <RosterRowView key={r.clienteId} row={r} busy={busy.has(r.clienteId)} onToggle={onToggle} />
              ))
            )}
          </div>

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
              Agregar walk-in
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
  onToggle,
}: {
  row: RosterRow;
  busy: boolean;
  onToggle: (clienteId: string) => void;
}) {
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
        transition: "background-color 180ms cubic-bezier(.32,.72,0,1)",
      }}
    >
      <Avatar initial={row.inicial} size={38} accent={row.present} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className="flex items-center" style={{ gap: 7 }}>
          <span className="uppercase font-semibold" style={{ fontSize: 13.5, letterSpacing: 0.3, color: "var(--fg)" }}>{row.nombre}</span>
          {row.isWalkIn && (
            <span className="uppercase" style={{ fontSize: 8.5, fontWeight: 800, letterSpacing: 0.8, color: "var(--gold)", border: "1px solid var(--yellow-edge)", padding: "1px 4px" }}>
              Walk-in
            </span>
          )}
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{row.paquete}</div>
      </div>
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
