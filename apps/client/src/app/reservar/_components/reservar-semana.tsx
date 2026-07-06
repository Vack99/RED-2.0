"use client";

import { useState } from "react";

import type { AgendaSemanaMiembroDTO, SesionMiembroDTO } from "@gym/data/server/agenda-miembro";

import { presentarEstadoReserva, type TonoReserva } from "../../../lib/reserva-vista";

/**
 * The Reservar week (slice #56, read-only). A client island because the day picker
 * switches days instantly over the whole-week DTO the server already resolved — no
 * refetch. The booking CTA and the profile avatar render but are inert this slice
 * (booking = #57, the profile overlay = a later slice). Occupancy is the derived
 * 0-active projection until booking lands. Brand-neutral: every color is a contract
 * token, so the same markup paints RED on RED hosts and Forge on Forge hosts.
 */

const NUM_TONE: Record<TonoReserva, string> = {
  open: "text-accent",
  full: "text-danger",
  finished: "text-muted",
};

function OccupancyBar({ pct, finished }: { pct: number; finished: boolean }) {
  return (
    <div className="mt-3 h-[3px] overflow-hidden rounded-full bg-sunk">
      <div
        className={`h-full rounded-full ${finished ? "bg-muted/40" : "bg-accent"}`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function ClassCard({ sesion }: { sesion: SesionMiembroDTO }) {
  const vista = presentarEstadoReserva(sesion.estado, sesion.disponibles);

  return (
    <div
      className={`flex overflow-hidden rounded-2xl border border-line bg-surface ${
        vista.atenuada ? "opacity-60" : ""
      }`}
    >
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="truncate text-lg font-bold uppercase tracking-wide text-fg">
              {sesion.tipo}
            </div>
            <div className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-muted">
              {sesion.coaches} · {sesion.duracionLabel}
            </div>
          </div>
          <div className="flex flex-none items-baseline gap-1.5">
            <span className="max-w-[3rem] text-right text-[9px] font-bold uppercase leading-tight tracking-wide text-muted">
              {vista.unidad}
            </span>
            <span className={`text-2xl font-extrabold tabular-nums ${NUM_TONE[vista.tono]}`}>
              {vista.numero}
            </span>
          </div>
        </div>
        <OccupancyBar pct={sesion.ocupacionPct} finished={vista.tono === "finished"} />
      </div>

      <div className="flex w-24 flex-none flex-col items-center justify-center gap-3 bg-sunk px-2.5 py-4">
        <span className="text-lg font-extrabold tabular-nums text-fg">{sesion.hora}</span>
        {vista.reservable ? (
          // Present but inert until booking ships (slice #57).
          <span className="cursor-default select-none bg-accent px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-white">
            {vista.cta}
          </span>
        ) : (
          <span
            className={`px-2.5 py-2 text-[8.5px] font-bold uppercase tracking-wide ${
              vista.tono === "full"
                ? "border border-danger/40 bg-danger-soft text-danger"
                : "border border-line bg-surface text-muted"
            }`}
          >
            {vista.cta}
          </span>
        )}
      </div>
    </div>
  );
}

export function ReservarSemana({
  semana,
  iniciales,
}: {
  semana: AgendaSemanaMiembroDTO;
  iniciales: string;
}) {
  const hoyIdx = semana.dias.findIndex((d) => d.esHoy);
  const [sel, setSel] = useState(hoyIdx >= 0 ? hoyIdx : 0);
  const dia = semana.dias[sel];

  return (
    <main className="mx-auto w-full max-w-md px-4 pb-10">
      <header className="flex items-start justify-between px-2 pt-6">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">
            Reservar clase
          </div>
          <h1 className="mt-2 text-3xl font-extrabold uppercase leading-none tracking-tight text-fg">
            Esta semana
          </h1>
        </div>
        {/* Profile avatar — renders now; its overlay ships in a later slice. */}
        <button
          type="button"
          aria-label="Perfil"
          className="flex h-10 w-10 flex-none items-center justify-center rounded-full border border-line bg-surface text-xs font-bold text-accent"
        >
          {iniciales}
        </button>
      </header>

      <div className="mt-5 flex gap-1 px-1">
        {semana.dias.map((d, i) => {
          const activo = i === sel;
          return (
            <button
              key={d.iso}
              type="button"
              onClick={() => setSel(i)}
              aria-pressed={activo}
              className="flex flex-1 flex-col items-center gap-2 py-1"
            >
              <span
                className={`text-[9px] font-bold uppercase tracking-wide ${
                  activo ? "text-fg" : "text-muted"
                }`}
              >
                {d.weekday}
              </span>
              <span
                className={`text-2xl font-extrabold tabular-nums leading-none ${
                  activo ? "text-accent" : "text-fg"
                }`}
              >
                {d.dnum}
              </span>
              <span className={`h-[3px] w-4 rounded-full ${activo ? "bg-accent" : "bg-transparent"}`} />
            </button>
          );
        })}
      </div>

      <div className="mx-2 mt-3 h-px bg-line" />

      <section className="mt-4 flex flex-col gap-3 px-1">
        {dia.sesiones.length > 0 ? (
          dia.sesiones.map((s) => <ClassCard key={s.id} sesion={s} />)
        ) : (
          <div className="px-6 py-12 text-center">
            <div className="text-base font-bold uppercase tracking-wide text-fg">
              Sin clases este día
            </div>
            <p className="mt-2 text-sm text-muted">
              Elige otro día de la semana para ver el horario.
            </p>
          </div>
        )}
      </section>

      <footer className="mt-6 px-2 text-center">
        <p className="text-[11px] text-muted">Cancela sin costo hasta 2 h antes de la clase.</p>
      </footer>
    </main>
  );
}
