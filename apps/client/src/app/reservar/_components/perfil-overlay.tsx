"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type { ProximaReservaDTO } from "@gym/data/server/agenda-miembro";

import { buildIcs } from "../../../lib/ics";
import { cancelarReservaAction } from "../actions";

/**
 * The consolidated Perfil overlay (PRD #49 Implementation Decisions: ONE component with
 * modes). This slice (#58) ships its SHELL — the full-screen right-to-left slide-in
 * opened from Reservar's avatar — plus the "Próximas reservas" section: the member's
 * upcoming bookings as cards with cancel + calendar actions, and the designed empty
 * state. Later slices add the membresía (#61) and perfil-hub (#62) sections as further
 * regions of THIS same overlay. Cancelling calls the atomic `cancelar_reserva` RPC then
 * refreshes so the freed spot re-derives on the week behind. Brand-neutral: every color
 * is a contract token.
 */

const backArrow = (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4l-6 6 6 6" />
  </svg>
);

const calIcon = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <rect x="4" y="5" width="16" height="16" rx="1" />
    <path d="M8 3v4M16 3v4M4 10h16" />
  </svg>
);

/** Trigger a client-side .ics download for a booking (the "Añadir al calendario" action). */
function descargarIcs(r: ProximaReservaDTO) {
  const ics = buildIcs({
    uid: r.sessionId,
    title: r.tipo,
    inicioIso: r.inicioIso,
    finIso: r.finIso,
    sala: r.sala,
  });
  const href = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;
  const a = document.createElement("a");
  a.href = href;
  a.download = `${r.tipo.toLowerCase().replace(/\s+/g, "-")}.ics`;
  a.click();
}

function ReservaCard({ r, onCancel }: { r: ProximaReservaDTO; onCancel: () => void }) {
  return (
    <div className="mb-3 flex overflow-hidden rounded-2xl border border-line bg-surface">
      <div className="flex w-[86px] flex-none flex-col items-center justify-center gap-1.5 bg-sunk px-2 py-4">
        <span className="text-xl font-extrabold tabular-nums text-accent">{r.hora}</span>
        <span className="text-center text-[8.5px] font-semibold uppercase leading-tight tracking-wide text-muted">
          {r.fechaCorta}
          <br />
          {r.mesCorto}
        </span>
      </div>
      <div className="min-w-0 flex-1 border-l border-dashed border-line p-4">
        <div className="flex items-center gap-2">
          <span className="truncate text-[17px] font-extrabold uppercase tracking-wide text-fg">{r.tipo}</span>
          <span className="flex-none border border-accent/40 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-accent">
            Confirmada
          </span>
        </div>
        <div className="mt-1.5 text-[10.5px] uppercase tracking-wide text-muted">
          {r.coaches} · {r.duracionLabel}
        </div>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 border border-danger/40 py-2.5 text-[9px] font-bold uppercase tracking-wide text-danger"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => descargarIcs(r)}
            className="flex flex-1 items-center justify-center gap-1.5 border border-line py-2.5 text-[9px] font-bold uppercase tracking-wide text-muted"
          >
            {calIcon}
            Calendario
          </button>
        </div>
      </div>
    </div>
  );
}

function EmptyReservas({ onReservar }: { onReservar: () => void }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-7 py-9 text-center">
      <div className="text-2xl text-accent">▢</div>
      <div className="mt-3 text-[15px] font-extrabold uppercase tracking-wide text-fg">Sin reservas activas</div>
      <p className="mt-2 text-xs leading-relaxed text-muted">Aparta tu lugar en la próxima clase.</p>
      <button
        type="button"
        onClick={onReservar}
        className="mt-5 w-full rounded-xl bg-accent py-3.5 text-xs font-extrabold uppercase tracking-wider text-white"
      >
        Reservar clase
      </button>
    </div>
  );
}

export function PerfilOverlay({
  open,
  onClose,
  nombre,
  iniciales,
  desde,
  reservas,
}: {
  open: boolean;
  onClose: () => void;
  nombre: string;
  iniciales: string;
  desde: string | null;
  reservas: ProximaReservaDTO[];
}) {
  const [shown, setShown] = useState(false);
  const [confirm, setConfirm] = useState<ProximaReservaDTO | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (!open) return;
    const id = requestAnimationFrame(() => setShown(true));
    // Cleanup runs when `open` flips back to false (or on unmount): slide the panel out
    // so the next open animates in from the right again.
    return () => {
      cancelAnimationFrame(id);
      setShown(false);
    };
  }, [open]);

  function close() {
    setConfirm(null);
    setError(null);
    onClose();
  }

  function cancelar() {
    if (!confirm) return;
    const target = confirm;
    setError(null);
    startTransition(async () => {
      const res = await cancelarReservaAction(target.sessionId);
      if (res.ok) {
        setConfirm(null);
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <div className={`fixed inset-0 z-50 flex justify-center ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div
        className={`relative flex w-full max-w-md flex-col bg-canvas shadow-[-34px_0_60px_-24px_rgba(0,0,0,0.75)] transition-transform duration-[420ms] ${
          shown ? "translate-x-0" : "translate-x-full"
        }`}
        role="dialog"
        aria-modal="true"
        aria-label="Perfil"
      >
        <header className="flex flex-none items-center justify-between px-5 pb-3 pt-4">
          <button
            type="button"
            onClick={close}
            className="flex min-w-[64px] items-center gap-2 text-muted"
            aria-label="Volver"
          >
            {backArrow}
            <span className="text-[10px] font-semibold uppercase tracking-[0.16em]">Volver</span>
          </button>
          <span className="text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Perfil</span>
          <span className="min-w-[64px]" />
        </header>

        <div className="flex-1 overflow-y-auto px-6 pb-8 pt-2">
          <div className="flex items-center gap-4 py-1.5">
            <span className="flex h-14 w-14 flex-none items-center justify-center rounded-full border border-line bg-surface text-sm font-bold text-accent">
              {iniciales}
            </span>
            <div className="min-w-0">
              <div className="truncate text-[22px] font-extrabold tracking-tight text-fg">{nombre}</div>
              {desde && <div className="mt-1 text-[10px] uppercase tracking-wide text-muted">Miembro desde {desde}</div>}
            </div>
          </div>

          <section className="mt-7">
            <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Próximas reservas</div>
            {reservas.length > 0 ? (
              reservas.map((r) => (
                <ReservaCard key={r.sessionId} r={r} onCancel={() => { setError(null); setConfirm(r); }} />
              ))
            ) : (
              <EmptyReservas onReservar={close} />
            )}
          </section>
        </div>

        {confirm && (
          <>
            <button
              type="button"
              aria-label="Cerrar"
              onClick={() => { setConfirm(null); setError(null); }}
              className="absolute inset-0 z-[5] bg-black/60"
            />
            <div className="absolute inset-x-0 bottom-0 z-[6] border-t border-line bg-canvas px-6 pb-8 pt-6">
              <h4 className="text-[17px] font-bold text-fg">¿Cancelar esta reserva?</h4>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                Liberarás tu lugar. Puedes volver a reservar si hay cupo.
              </p>
              {error && <p className="mt-2.5 text-[11px] font-semibold text-danger">{error}</p>}
              <div className="mt-4 flex gap-2.5">
                <button
                  type="button"
                  onClick={() => { setConfirm(null); setError(null); }}
                  className="flex-1 rounded-xl border border-line py-3.5 text-[11px] font-bold uppercase tracking-wider text-muted"
                >
                  Conservar lugar
                </button>
                <button
                  type="button"
                  onClick={cancelar}
                  disabled={pending}
                  className="flex-1 rounded-xl bg-danger py-3.5 text-[11px] font-bold uppercase tracking-wider text-white disabled:opacity-70"
                >
                  {pending ? "Cancelando…" : "Sí, cancelar"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
