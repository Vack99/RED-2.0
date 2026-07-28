"use client";

/* PROTOTYPE B — "Recepción": a tappable grid of faces scoped to the current class,
   plus today's arrivals as a timestamped feed. Throwaway (#89).

   Search is a FILTER, never the primary path: Zen Planner shipped a staff app that
   replaced its face list with a search box, staff revolted in public reviews
   ("instead of a row of names and pictures… you must tediously type in names"), and
   the vendor shipped the face list back in 1.0.11. The list is the strength; the fix
   is to SCOPE it, not to delete it. */

import * as React from "react";
import type { PaseClienteDTO } from "@gym/data/server/clientes";
import { Icon } from "@gym/ui/forge/icon";
import { Avatar, Eyebrow, H1, Input, Tnum } from "@gym/ui/forge/ui";

import type { SesionProto } from "../../prototype-sesiones";
import { Aviso, LIBRE, personas, sesionCercana, useMarcasProto } from "./shared";

export const NOMBRE = "Recepción (caras + feed)";

export function VariantBFeed({
  clientes,
  sesiones,
  marcadasHoy,
}: {
  clientes: PaseClienteDTO[];
  sesiones: SesionProto[];
  marcadasHoy: string[];
}) {
  const [ctx, setCtx] = React.useState<string>(() => sesionCercana(sesiones));
  const [query, setQuery] = React.useState("");
  const { marcas, marcar, quitar } = useMarcasProto(marcadasHoy);

  const porId = React.useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);
  const nombreCtx = React.useCallback(
    (k: string) => {
      if (k === LIBRE) return "ACCESO LIBRE";
      const s = sesiones.find((x) => x.id === k);
      return s ? `${s.hora} ${s.tipo}` : "?";
    },
    [sesiones],
  );

  const yaEnCtx = new Set(marcas.filter((m) => m.ctx === ctx).map((m) => m.clienteId));
  const q = query.trim().toLowerCase();
  // Scoped list: whoever is not yet registered in THIS context. Search narrows it.
  const caras = clientes.filter((c) => !yaEnCtx.has(c.id) && (!q || c.nombre.toLowerCase().includes(q)));
  const feed = [...marcas].reverse();

  return (
    <div>
      <Aviso />

      <div style={{ padding: "14px 22px 0" }}>
        <H1 size={38}>RECEPCIÓN</H1>
        <div className="flex" style={{ gap: 26, marginTop: 10 }}>
          <div>
            <Eyebrow>REGISTROS</Eyebrow>
            <Tnum className="font-extrabold" style={{ fontSize: 30, color: "var(--yellow)", lineHeight: 1 }}>
              {marcas.length}
            </Tnum>
          </div>
          <div>
            <Eyebrow>PERSONAS</Eyebrow>
            <Tnum className="font-extrabold" style={{ fontSize: 30, color: "var(--fg)", lineHeight: 1 }}>
              {personas(marcas)}
            </Tnum>
          </div>
        </div>
      </div>

      {/* Registering context — preselected to the class nearest right now. */}
      <div style={{ padding: "16px 22px 0" }}>
        <Eyebrow>REGISTRANDO EN</Eyebrow>
      </div>
      <div className="forge-scroll flex overflow-x-auto" style={{ gap: 6, padding: "8px 16px 0" }}>
        {[{ id: LIBRE, hora: "", tipo: "ACCESO LIBRE" }, ...sesiones].map((s) => {
          const on = s.id === ctx;
          return (
            <button
              key={s.id}
              onClick={() => setCtx(s.id)}
              className="shrink-0 uppercase"
              style={{
                padding: "9px 13px",
                background: on ? "var(--fg)" : "transparent",
                border: `1px solid ${on ? "var(--fg)" : "var(--line)"}`,
                color: on ? "var(--canvas)" : "var(--fg)",
                fontSize: 11,
                fontWeight: 800,
                letterSpacing: 0.8,
                cursor: "pointer",
                whiteSpace: "nowrap",
              }}
            >
              {s.hora ? `${s.hora} · ${s.tipo}` : s.tipo}
            </button>
          );
        })}
      </div>

      <div style={{ padding: "14px 16px 0" }}>
        <Input icon="search" placeholder="Filtrar…" value={query} onChange={setQuery} />
      </div>

      {/* The face grid — one tap registers into the selected context. */}
      <div className="flex flex-wrap" style={{ gap: 10, padding: "14px 16px 0" }}>
        {caras.map((c) => (
          <button
            key={c.id}
            onClick={() => marcar(c.id, ctx)}
            className="forge-pressable flex flex-col items-center"
            style={{
              width: 74,
              padding: "10px 4px",
              gap: 6,
              background: "transparent",
              border: "1px solid var(--line)",
              cursor: "pointer",
            }}
          >
            <Avatar initial={c.inicial} size={38} />
            <span
              className="uppercase"
              style={{
                fontSize: 9,
                fontWeight: 700,
                letterSpacing: 0.4,
                color: "var(--fg)",
                width: "100%",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                textAlign: "center",
              }}
            >
              {c.nombre.split(" ")[0]}
            </span>
            <span style={{ fontSize: 8.5, color: c.porVencer ? "var(--gold)" : "var(--muted-soft)" }}>
              {c.clasesLabel}
            </span>
          </button>
        ))}
        {caras.length === 0 && (
          <div style={{ padding: "16px 6px", fontSize: 12.5, color: "var(--muted)" }}>
            Todos registrados en {nombreCtx(ctx)}.
          </div>
        )}
      </div>

      <div style={{ padding: "24px 22px 8px" }}>
        <Eyebrow>HOY</Eyebrow>
      </div>

      {feed.length === 0 ? (
        <div style={{ padding: "30px 22px", textAlign: "center", fontSize: 13, color: "var(--muted)" }}>
          Nadie ha llegado todavía.
        </div>
      ) : (
        feed.map((m) => (
          <div
            key={m.id}
            className="flex items-center"
            style={{ gap: 12, padding: "11px 22px", borderBottom: "1px solid var(--line)" }}
          >
            <Tnum style={{ width: 42, fontSize: 12, fontWeight: 700, color: "var(--gold)" }}>{m.hora}</Tnum>
            <div className="min-w-0 flex-1">
              <div className="uppercase font-semibold" style={{ fontSize: 13.5, letterSpacing: 0.4 }}>
                {porId.get(m.clienteId)?.nombre ?? "—"}
              </div>
            </div>
            <span
              className="uppercase shrink-0"
              style={{
                padding: "3px 7px",
                background: m.ctx === LIBRE ? "var(--line)" : "var(--yellow-soft)",
                color: m.ctx === LIBRE ? "var(--muted)" : "var(--gold)",
                fontSize: 9,
                fontWeight: 800,
                letterSpacing: 0.8,
              }}
            >
              {nombreCtx(m.ctx)}
            </span>
            <button
              onClick={() => quitar(m.id)}
              aria-label="Deshacer"
              className="forge-hit flex shrink-0 items-center justify-center"
              style={{
                width: 28,
                height: 28,
                background: "transparent",
                border: "1px solid var(--line)",
                cursor: "pointer",
              }}
            >
              <Icon name="close" size={13} color="var(--muted)" />
            </button>
          </div>
        ))
      )}

      <div style={{ height: 140 }} />
    </div>
  );
}
