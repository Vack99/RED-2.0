"use client";

/* PROTOTYPE A — "Chips": today's checklist, re-scoped by a class context.
   Throwaway (#89). */

import * as React from "react";
import type { PaseClienteDTO } from "@gym/data/server/clientes";
import { Icon } from "@gym/ui/forge/icon";
import { Avatar, Card, Eyebrow, H1, Input, Tnum } from "@gym/ui/forge/ui";

import type { SesionProto } from "../../prototype-sesiones";
import { Aviso, enCtx, LIBRE, sesionCercana, useMarcasProto } from "./shared";

export const NOMBRE = "Chips de clase";

export function VariantAChips({
  clientes,
  sesiones,
  marcadasHoy,
}: {
  clientes: PaseClienteDTO[];
  sesiones: SesionProto[];
  marcadasHoy: string[];
}) {
  // Zen Planner's kiosk rule: open on the class happening right now, else open access.
  const [ctx, setCtx] = React.useState<string>(() => sesionCercana(sesiones));
  const [query, setQuery] = React.useState("");
  const { marcas, toggle } = useMarcasProto(marcadasHoy);

  const contextos = React.useMemo(
    () => [
      { k: LIBRE, hora: "", label: "ACCESO LIBRE", cupo: clientes.length },
      ...sesiones.map((s) => ({ k: s.id, hora: s.hora, label: s.tipo, cupo: s.capacidad })),
    ],
    [sesiones, clientes.length],
  );

  const actual = contextos.find((c) => c.k === ctx) ?? contextos[0];
  const enEste = enCtx(marcas, ctx);
  const pct = actual.cupo ? Math.min(100, Math.round((enEste.length / actual.cupo) * 100)) : 0;

  const filtered = clientes.filter((c) => c.nombre.toLowerCase().includes(query.trim().toLowerCase()));

  const etiqueta = (k: string) => {
    const c = contextos.find((x) => x.k === k);
    if (!c) return "?";
    return c.k === LIBRE ? "ACCESO LIBRE" : c.label;
  };

  return (
    <div>
      <Aviso />

      <div style={{ padding: "14px 22px 4px" }}>
        <H1 size={38}>ASISTENCIA</H1>
        <div style={{ marginTop: 6, fontSize: 12, color: "var(--muted)" }}>
          <Tnum style={{ color: "var(--gold)", fontWeight: 700 }}>{enEste.length}</Tnum> en{" "}
          {actual.k === LIBRE ? "acceso libre" : `${actual.hora} ${actual.label}`} ·{" "}
          <Tnum>{marcas.length}</Tnum> registros hoy
        </div>
      </div>

      {/* The one new affordance: the context this tap belongs to. */}
      <div
        className="forge-scroll flex overflow-x-auto"
        style={{ gap: 6, padding: "12px 16px 4px", scrollSnapType: "x proximity" }}
      >
        {contextos.map((c) => {
          const on = c.k === ctx;
          const n = enCtx(marcas, c.k).length;
          return (
            <button
              key={c.k}
              onClick={() => setCtx(c.k)}
              className="flex shrink-0 flex-col items-start"
              style={{
                padding: "8px 12px",
                gap: 2,
                minWidth: 104,
                scrollSnapAlign: "start",
                background: on ? "var(--yellow)" : "transparent",
                border: `1px solid ${on ? "var(--yellow)" : "var(--line)"}`,
                color: on ? "var(--ink)" : "var(--fg)",
                cursor: "pointer",
                transition: "background-color 150ms cubic-bezier(.32,.72,0,1)",
              }}
            >
              <span style={{ fontSize: 9, fontWeight: 800, letterSpacing: 0.8, opacity: on ? 0.75 : 0.6 }}>
                {c.k === LIBRE ? "SIN CLASE" : c.hora}
              </span>
              <span className="uppercase" style={{ fontSize: 12, fontWeight: 800, letterSpacing: 0.4 }}>
                {c.label}
              </span>
              <Tnum style={{ fontSize: 10.5, opacity: 0.8 }}>
                {n}
                {c.k === LIBRE ? "" : ` / ${c.cupo}`}
              </Tnum>
            </button>
          );
        })}
      </div>

      <Card style={{ margin: "8px 16px 0" }}>
        <div className="flex items-center justify-between">
          <Eyebrow>{actual.k === LIBRE ? "ACCESO LIBRE" : `${actual.hora} · ${actual.label}`}</Eyebrow>
          <Tnum style={{ fontSize: 12, color: "var(--gold)", fontWeight: 800 }}>{pct}%</Tnum>
        </div>
        <div className="flex items-baseline" style={{ gap: 6, marginTop: 6 }}>
          <Tnum className="font-extrabold" style={{ fontSize: 44, lineHeight: 0.9, color: "var(--yellow)" }}>
            {enEste.length}
          </Tnum>
          <Tnum className="font-extrabold" style={{ fontSize: 26, color: "var(--muted)" }}>
            / {actual.cupo}
          </Tnum>
        </div>
        <div style={{ marginTop: 14, height: 3, background: "var(--line)", overflow: "hidden" }}>
          <div
            style={{
              height: "100%",
              width: "100%",
              background: "var(--yellow)",
              transform: `scaleX(${pct / 100})`,
              transformOrigin: "left",
              transition: "transform 380ms cubic-bezier(.32,.72,0,1)",
            }}
          />
        </div>
      </Card>

      <div style={{ padding: "16px 16px 4px" }}>
        <Input icon="search" placeholder="Buscar cliente…" value={query} onChange={setQuery} />
      </div>

      <div style={{ paddingTop: 8 }}>
        {filtered.map((c, i) => {
          const aqui = marcas.some((m) => m.clienteId === c.id && m.ctx === ctx);
          const misMarcas = marcas.filter((m) => m.clienteId === c.id);
          return (
            <div
              key={c.id}
              onClick={() => toggle(c.id, ctx)}
              className="forge-pressable flex w-full items-center select-none"
              style={{
                gap: 14,
                padding: "12px 22px",
                borderTop: i === 0 ? "1px solid var(--line)" : "none",
                borderBottom: "1px solid var(--line)",
                cursor: "pointer",
                background: aqui ? "var(--yellow-soft)" : "transparent",
              }}
            >
              <Avatar initial={c.inicial} size={40} accent={aqui} />
              <div className="min-w-0 flex-1">
                <div className="uppercase font-semibold" style={{ fontSize: 14, letterSpacing: 0.4 }}>
                  {c.nombre}
                </div>
                <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 3 }}>
                  {c.paquete} · {c.clasesLabel}
                </div>
                {/* Visits render as timestamped entries, one per visit — the display every
                    surveyed product uses. No "×2" badge exists anywhere in the industry. */}
                {misMarcas.length > 0 && (
                  <div className="flex flex-wrap" style={{ gap: 10, marginTop: 4 }}>
                    {misMarcas.map((m) => (
                      <span
                        key={m.id}
                        className="uppercase"
                        style={{
                          fontSize: 9.5,
                          fontWeight: 800,
                          letterSpacing: 0.7,
                          color: m.ctx === ctx ? "var(--gold)" : "var(--muted-soft)",
                        }}
                      >
                        {m.hora} · {etiqueta(m.ctx)}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              <div
                className="flex shrink-0 items-center justify-center"
                style={{
                  width: 28,
                  height: 28,
                  background: aqui ? "var(--yellow)" : "transparent",
                  border: `1.5px solid ${aqui ? "var(--yellow)" : "var(--muted-soft)"}`,
                }}
              >
                {aqui && <Icon name="check" size={16} color="var(--ink)" />}
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ height: 140 }} />
    </div>
  );
}
