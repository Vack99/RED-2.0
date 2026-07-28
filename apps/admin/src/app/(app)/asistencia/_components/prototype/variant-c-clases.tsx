"use client";

/* PROTOTYPE C — "Clases": the desk becomes today's classes as sections, plus an
   ACCESO LIBRE bucket. Modelled on PushPress's Check-Ins page — "the front desk's
   home base for managing daily attendance" — which shows the day's class cards AND
   an Open Gym table on one screen, with walk-in add on either and a ⋮ menu offering
   "Move to Class" / "Move to Open Gym" to re-attribute a visit after the fact.
   Throwaway (#89). */

import * as React from "react";
import type { PaseClienteDTO } from "@gym/data/server/clientes";
import { Icon } from "@gym/ui/forge/icon";
import { Avatar, Eyebrow, H1, Input, Tnum } from "@gym/ui/forge/ui";

import type { SesionProto } from "../../prototype-sesiones";
import { Aviso, enCtx, LIBRE, personas, useMarcasProto } from "./shared";

export const NOMBRE = "Clases del día";

interface SeccionDef {
  k: string;
  hora: string;
  titulo: string;
  cupo: number | null;
}

export function VariantCClases({
  clientes,
  sesiones,
  marcadasHoy,
}: {
  clientes: PaseClienteDTO[];
  sesiones: SesionProto[];
  marcadasHoy: string[];
}) {
  const { marcas, marcar, quitar, mover } = useMarcasProto(marcadasHoy);
  const [abierta, setAbierta] = React.useState<string | null>(sesiones[0]?.id ?? LIBRE);

  const porId = React.useMemo(() => new Map(clientes.map((c) => [c.id, c])), [clientes]);

  const secciones: SeccionDef[] = [
    ...sesiones.map((s) => ({ k: s.id, hora: s.hora, titulo: s.tipo, cupo: s.capacidad as number | null })),
    { k: LIBRE, hora: "", titulo: "ACCESO LIBRE", cupo: null },
  ];

  return (
    <div>
      <Aviso />

      <div style={{ padding: "14px 22px 4px" }}>
        <H1 size={38}>HOY</H1>
        <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>
          <Tnum style={{ color: "var(--gold)", fontWeight: 700 }}>{sesiones.length}</Tnum> clases ·{" "}
          <Tnum>{marcas.length}</Tnum> registros · <Tnum>{personas(marcas)}</Tnum> personas
        </div>
      </div>

      <div style={{ padding: "12px 0 0" }}>
        {secciones.map((s) => (
          <Seccion
            key={s.k}
            seccion={s}
            secciones={secciones}
            abierta={abierta === s.k}
            onToggle={() => setAbierta((a) => (a === s.k ? null : s.k))}
            marcas={enCtx(marcas, s.k)}
            clientes={clientes}
            porId={porId}
            onAgregar={(clienteId) => marcar(clienteId, s.k)}
            onQuitar={quitar}
            onMover={mover}
          />
        ))}
        {sesiones.length === 0 && (
          <div style={{ padding: "20px 22px", fontSize: 12.5, color: "var(--muted)" }}>
            No hay clases programadas hoy — solo ACCESO LIBRE.
          </div>
        )}
      </div>

      <div style={{ height: 140 }} />
    </div>
  );
}

function Seccion({
  seccion,
  secciones,
  abierta,
  onToggle,
  marcas,
  clientes,
  porId,
  onAgregar,
  onQuitar,
  onMover,
}: {
  seccion: SeccionDef;
  secciones: SeccionDef[];
  abierta: boolean;
  onToggle: () => void;
  marcas: { id: string; clienteId: string; hora: string }[];
  clientes: PaseClienteDTO[];
  porId: Map<string, PaseClienteDTO>;
  onAgregar: (clienteId: string) => void;
  onQuitar: (id: string) => void;
  onMover: (id: string, ctx: string) => void;
}) {
  const [query, setQuery] = React.useState("");
  const [moviendo, setMoviendo] = React.useState<string | null>(null);

  const yaAqui = new Set(marcas.map((m) => m.clienteId));
  const q = query.trim().toLowerCase();
  const candidatos = q
    ? clientes.filter((c) => !yaAqui.has(c.id) && c.nombre.toLowerCase().includes(q)).slice(0, 5)
    : [];

  return (
    <div style={{ borderTop: "1px solid var(--line)" }}>
      <button
        onClick={onToggle}
        className="forge-pressable flex w-full items-center"
        style={{
          gap: 12,
          padding: "14px 22px",
          background: abierta ? "var(--surface)" : "transparent",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        <Tnum style={{ width: 46, fontSize: 13, fontWeight: 800, color: "var(--gold)" }}>
          {seccion.hora || "—"}
        </Tnum>
        <div className="min-w-0 flex-1">
          <div className="uppercase font-extrabold" style={{ fontSize: 14, letterSpacing: 0.6 }}>
            {seccion.titulo}
          </div>
        </div>
        <Tnum style={{ fontSize: 13, fontWeight: 800, color: marcas.length ? "var(--yellow)" : "var(--muted)" }}>
          {marcas.length}
          {seccion.cupo !== null && <span style={{ color: "var(--muted)" }}> / {seccion.cupo}</span>}
        </Tnum>
        <span
          style={{
            display: "inline-flex",
            transform: abierta ? "rotate(180deg)" : "none",
            transition: "transform 160ms cubic-bezier(.32,.72,0,1)",
          }}
        >
          <Icon name="chevD" size={15} color="var(--muted)" />
        </span>
      </button>

      {abierta && (
        <div style={{ padding: "0 16px 16px" }}>
          {marcas.map((m) => (
            <div key={m.id}>
              <div className="flex items-center" style={{ gap: 12, padding: "10px 6px", borderBottom: "1px solid var(--line)" }}>
                <Avatar initial={porId.get(m.clienteId)?.inicial ?? "?"} size={32} accent />
                <div className="min-w-0 flex-1">
                  <div className="uppercase font-semibold" style={{ fontSize: 13, letterSpacing: 0.4 }}>
                    {porId.get(m.clienteId)?.nombre ?? "—"}
                  </div>
                </div>
                <Tnum style={{ fontSize: 11, color: "var(--muted)" }}>{m.hora}</Tnum>
                {/* PushPress's "Move to Class" — correct the attribution after the fact. */}
                <button
                  onClick={() => setMoviendo((x) => (x === m.id ? null : m.id))}
                  aria-label="Mover a otra clase"
                  className="forge-hit flex shrink-0 items-center justify-center"
                  style={{
                    width: 26,
                    height: 26,
                    background: moviendo === m.id ? "var(--yellow)" : "transparent",
                    border: "1px solid var(--line)",
                    cursor: "pointer",
                  }}
                >
                  <Icon name="swap" size={12} color={moviendo === m.id ? "var(--ink)" : "var(--muted)"} />
                </button>
                <button
                  onClick={() => onQuitar(m.id)}
                  aria-label="Quitar"
                  className="forge-hit flex shrink-0 items-center justify-center"
                  style={{ width: 26, height: 26, background: "transparent", border: "1px solid var(--line)", cursor: "pointer" }}
                >
                  <Icon name="close" size={12} color="var(--muted)" />
                </button>
              </div>

              {moviendo === m.id && (
                <div
                  className="forge-scroll flex overflow-x-auto"
                  style={{ gap: 6, padding: "10px 6px", background: "var(--surface)" }}
                >
                  {secciones
                    .filter((s) => s.k !== seccion.k)
                    .map((s) => (
                      <button
                        key={s.k}
                        onClick={() => {
                          onMover(m.id, s.k);
                          setMoviendo(null);
                        }}
                        className="shrink-0 uppercase"
                        style={{
                          padding: "7px 10px",
                          background: "transparent",
                          border: "1px solid var(--line)",
                          color: "var(--fg)",
                          fontSize: 10,
                          fontWeight: 800,
                          letterSpacing: 0.6,
                          cursor: "pointer",
                          whiteSpace: "nowrap",
                        }}
                      >
                        MOVER A {s.hora ? `${s.hora} ${s.titulo}` : s.titulo}
                      </button>
                    ))}
                </div>
              )}
            </div>
          ))}

          {marcas.length === 0 && (
            <div style={{ padding: "12px 6px", fontSize: 12, color: "var(--muted)" }}>Nadie registrado.</div>
          )}

          <div style={{ marginTop: 12 }}>
            <Input icon="plus" placeholder="Agregar a esta clase…" value={query} onChange={setQuery} />
          </div>

          {candidatos.map((c) => (
            <div
              key={c.id}
              onClick={() => {
                onAgregar(c.id);
                setQuery("");
              }}
              className="forge-pressable flex items-center"
              style={{ gap: 12, padding: "10px 6px", borderBottom: "1px solid var(--line)", cursor: "pointer" }}
            >
              <Avatar initial={c.inicial} size={32} />
              <div className="min-w-0 flex-1">
                <div className="uppercase font-semibold" style={{ fontSize: 13, letterSpacing: 0.4 }}>
                  {c.nombre}
                </div>
                <div style={{ fontSize: 11, color: "var(--muted)", marginTop: 2 }}>{c.clasesLabel}</div>
              </div>
              <Icon name="plus" size={15} color="var(--gold)" />
            </div>
          ))}

          {seccion.k !== LIBRE && (
            <div style={{ marginTop: 10 }}>
              <Eyebrow>UN MIEMBRO PUEDE ESTAR EN VARIAS SECCIONES EL MISMO DÍA</Eyebrow>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
