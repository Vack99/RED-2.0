"use client";

import type { ReactNode } from "react";
import Link from "next/link";

import type { ConfirmacionReservaDTO } from "@gym/data/server/clase-miembro";

import { buildIcs } from "../../../../lib/ics";

/**
 * The Confirmada view (slice #59), a faithful translation of the mock's `confirmada` slot:
 * the success check, the ticket card (time rail + type + coaches + día/hora/estudio rows +
 * the favorita tag), the arrival reminders, and the actions. A client island only for the
 * "Añadir al calendario" .ics download (the honest form of the mock's toast). Every color
 * is a contract token.
 */

const reminders: { icon: ReactNode; texto: string }[] = [
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M12 7v5l3 2" />
      </svg>
    ),
    texto: "Llega 10 min antes. Pasada la hora de inicio, tu lugar se libera.",
  },
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 3h8M9 3v3a5 5 0 0 0 6 0V3M8 21h8M10 21v-4a4 4 0 0 1 4 0v4" />
      </svg>
    ),
    texto: "Trae agua y una toalla. Suda, hidrata, repite.",
  },
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M2 17h20M3 17l2-5h9l4 3h3M6 12V9h5" />
      </svg>
    ),
    texto: "Calzado de entrenamiento. Nada de suela lisa.",
  },
  {
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="9" />
        <path d="M15 9l-6 6M9 9l6 6" />
      </svg>
    ),
    texto: "¿No puedes asistir? Cancela hasta 2 h antes desde Mis reservas.",
  },
];

function TicketRow({ k, v, accent }: { k: string; v: string; accent?: boolean }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-t border-dashed border-line py-2">
      <span className="text-[10px] uppercase tracking-wide text-muted">{k}</span>
      <span className={`text-right text-xs font-semibold ${accent ? "text-accent" : "text-fg"}`}>{v}</span>
    </div>
  );
}

export function ConfirmadaVista({ confirmacion }: { confirmacion: ConfirmacionReservaDTO }) {
  function descargarIcs() {
    const ics = buildIcs({
      uid: confirmacion.sessionId,
      title: confirmacion.tipo,
      inicioIso: confirmacion.inicioIso,
      finIso: confirmacion.finIso,
      sala: confirmacion.sala,
    });
    const href = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
    const a = document.createElement("a");
    a.href = href;
    a.download = `${confirmacion.tipo.toLowerCase().replace(/\s+/g, "-")}.ics`;
    a.click();
  }

  return (
    <main className="mx-auto w-full max-w-md px-6 pb-10">
      <div className="pt-10 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-accent text-white">
          <svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
            <path d="M20 6L9 17l-5-5" />
          </svg>
        </div>
        <div className="mt-4 text-[10px] font-bold uppercase tracking-[0.2em] text-accent">Reserva confirmada</div>
        <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-fg">¡Estás dentro!</h1>
        <p className="mt-2 text-xs leading-relaxed text-muted">
          Te esperamos. No faltes — tu lugar está apartado.
        </p>
      </div>

      {/* Ticket */}
      <div className="mt-7 flex overflow-hidden rounded-2xl border border-line bg-surface">
        <div className="flex w-[92px] flex-none flex-col items-center justify-center gap-1.5 bg-sunk px-2 py-5">
          <span className="text-2xl font-extrabold tabular-nums text-accent">{confirmacion.hora}</span>
          <span className="text-center text-[9px] font-semibold uppercase leading-tight tracking-wide text-muted">
            {confirmacion.fechaCorta}
            <br />
            {confirmacion.mesCorto}
          </span>
        </div>
        <div className="min-w-0 flex-1 border-l border-dashed border-line p-4">
          <div className="text-xl font-extrabold uppercase tracking-wide text-fg">{confirmacion.tipo}</div>
          <div className="mt-1 text-[11px] uppercase tracking-wide text-muted">{confirmacion.coaches}</div>
          <div className="mt-3">
            <TicketRow k="Día" v={confirmacion.fechaLarga} />
            <TicketRow k="Hora" v={`${confirmacion.hora}–${confirmacion.horaFin} · ${confirmacion.duracionLabel}`} />
            <TicketRow k="Estudio" v={confirmacion.sala ?? "Estudio"} />
            {confirmacion.favorita && <TicketRow k="Etiqueta" v="Tu favorita" accent />}
          </div>
        </div>
      </div>

      {/* Reminders */}
      <div className="mt-5 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-4">
        {reminders.map((r, i) => (
          <div key={i} className="flex items-start gap-3">
            <span className="flex-none text-accent">{r.icon}</span>
            <span className="text-xs leading-relaxed text-muted">{r.texto}</span>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="mt-6 flex flex-col gap-3">
        <button
          type="button"
          onClick={descargarIcs}
          className="flex w-full items-center justify-center gap-2 rounded-xl border border-line py-3.5 text-xs font-bold uppercase tracking-wider text-muted"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="4" y="5" width="16" height="16" rx="1" />
            <path d="M8 3v4M16 3v4M4 10h16" />
          </svg>
          Añadir al calendario
        </button>
        <Link
          href="/reservar"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-4 text-xs font-extrabold uppercase tracking-wider text-white"
        >
          Ver mis reservas
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M5 10h10M11 6l4 4-4 4" />
          </svg>
        </Link>
        <Link href="/reservar" className="text-center text-[11px] font-semibold uppercase tracking-wider text-muted">
          Reservar otra
        </Link>
      </div>
    </main>
  );
}
