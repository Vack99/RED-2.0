"use client";

import { type ReactNode, useEffect, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createClient } from "@gym/data/client";
import type { ProximaReservaDTO } from "@gym/data/server/agenda-miembro";

import { buildIcs } from "../../../lib/ics";
import { cancelarReservaAction, setNotificacionesAction } from "../actions";

/**
 * The consolidated Perfil overlay (PRD #49 Implementation Decisions: ONE component with
 * modes). The SHELL + "Próximas reservas" landed in #58; THIS slice (#62) completes the
 * hub: the identity block (already present), the Cuenta settings list — a notifications
 * PREFERENCE toggle (in-app, no delivery channel; persisted via a self-scoped DEFINER
 * toggle), Términos y privacidad → the legal texts, Ayuda y contacto → the marketing
 * Contacto page, and Cerrar sesión with its confirm sheet returning the signed-out socio
 * to the landing — plus the footer app-version line. The mock's "Datos personales" stub
 * is dropped (no dead controls). Brand-neutral: every color is a contract token, and the
 * footer brand name is real data (gym.brand_name), never a hardcoded string.
 */

const backArrow = (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4l-6 6 6 6" />
  </svg>
);

const chevron = (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
    <path d="M8 5l5 5-5 5" />
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

/** The mock's pf-toggle: an accent pill knob. Reflects the persisted preference; the
 *  parent owns the optimistic flip + the action call. */
function Toggle({ on, onToggle, disabled }: { on: boolean; onToggle: () => void; disabled: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label="Notificaciones"
      onClick={onToggle}
      disabled={disabled}
      className={`relative h-6 w-[42px] flex-none rounded-full transition-colors disabled:opacity-70 ${
        on ? "bg-accent/40" : "bg-sunk"
      }`}
    >
      <span
        className={`absolute top-[3px] h-[18px] w-[18px] rounded-full transition-transform ${
          on ? "translate-x-[21px] bg-accent" : "translate-x-[3px] bg-muted-soft"
        }`}
      />
    </button>
  );
}

/** A Cuenta list row: a label plus a trailing control (chevron for links, the toggle for
 *  the preference). `danger` tints the label accent for Cerrar sesión. */
function Row({
  label,
  trailing,
  danger,
  onClick,
  href,
}: {
  label: string;
  trailing?: ReactNode;
  danger?: boolean;
  onClick?: () => void;
  href?: string;
}) {
  const inner = (
    <>
      <span className={`flex-1 text-sm ${danger ? "font-semibold text-accent" : "text-fg"}`}>{label}</span>
      {trailing}
    </>
  );
  const cls = "flex w-full items-center gap-3.5 border-t border-line py-4 text-left";
  if (href) {
    return (
      <Link href={href} onClick={onClick} className={cls}>
        {inner}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  );
}

/** The shared bottom-sheet confirm (the mock's pconf), reused by cancel-reserva and
 *  cerrar-sesión: a scrim + a slide-up card with a title, body, optional error, and a
 *  keep/confirm button pair. */
function ConfirmSheet({
  title,
  body,
  error,
  cancelLabel,
  confirmLabel,
  danger,
  pending,
  onCancel,
  onConfirm,
}: {
  title: string;
  body: string;
  error: string | null;
  cancelLabel: string;
  confirmLabel: string;
  danger?: boolean;
  pending: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <>
      <button type="button" aria-label="Cerrar" onClick={onCancel} className="absolute inset-0 z-[5] bg-black/60" />
      <div className="absolute inset-x-0 bottom-0 z-[6] border-t border-line bg-canvas px-6 pb-8 pt-6">
        <h4 className="text-[17px] font-bold text-fg">{title}</h4>
        <p className="mt-2 text-xs leading-relaxed text-muted">{body}</p>
        {error && <p className="mt-2.5 text-[11px] font-semibold text-danger">{error}</p>}
        <div className="mt-4 flex gap-2.5">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-line py-3.5 text-[11px] font-bold uppercase tracking-wider text-muted"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className={`flex-1 rounded-xl py-3.5 text-[11px] font-bold uppercase tracking-wider text-white disabled:opacity-70 ${
              danger ? "bg-danger" : "bg-accent"
            }`}
          >
            {pending ? "Un momento…" : confirmLabel}
          </button>
        </div>
      </div>
    </>
  );
}

export function PerfilOverlay({
  open,
  onClose,
  nombre,
  iniciales,
  desde,
  reservas,
  notificaciones,
  marca,
}: {
  open: boolean;
  onClose: () => void;
  nombre: string;
  iniciales: string;
  desde: string | null;
  reservas: ProximaReservaDTO[];
  notificaciones: boolean;
  marca: string;
}) {
  const [shown, setShown] = useState(false);
  const [confirm, setConfirm] = useState<ProximaReservaDTO | null>(null);
  const [logout, setLogout] = useState(false);
  const [logoutPending, setLogoutPending] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);
  // The toggle is the sole writer of this preference and the overlay stays mounted across
  // the post-flip revalidation, so local state seeded from the prop needs no sync effect;
  // a successful flip already matches the re-read server value, a failed one reverts.
  const [notif, setNotif] = useState(notificaciones);
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
    setLogout(false);
    setLogoutError(null);
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

  /** Optimistic preference flip: paint the new state immediately, persist behind it, and
   *  roll back to the DB truth on failure (a preference, so no blocking spinner). */
  function toggleNotif() {
    const next = !notif;
    setNotif(next);
    startTransition(async () => {
      const res = await setNotificacionesAction(next);
      if (!res.ok) setNotif(!next);
    });
  }

  async function cerrarSesion() {
    setLogoutPending(true);
    setLogoutError(null);
    const { error: signOutError } = await createClient().auth.signOut();
    if (signOutError) {
      setLogoutError("No se pudo cerrar sesión. Inténtalo de nuevo.");
      setLogoutPending(false);
      return;
    }
    router.replace("/");
    router.refresh();
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

          <section className="mt-8">
            <div className="mb-1.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Cuenta</div>
            <Row label="Notificaciones" trailing={<Toggle on={notif} onToggle={toggleNotif} disabled={pending} />} />
            <Row
              label="Términos y privacidad"
              trailing={<span className="text-muted-soft">{chevron}</span>}
              href="/legal"
              onClick={close}
            />
            <Row
              label="Ayuda y contacto"
              trailing={<span className="text-muted-soft">{chevron}</span>}
              href="/contacto"
              onClick={close}
            />
            <Row label="Cerrar sesión" danger onClick={() => { setLogoutError(null); setLogout(true); }} />
          </section>

          <footer className="mt-8 text-center">
            <div className="text-[9px] uppercase tracking-[0.16em] text-muted-soft">{marca} App v1.0</div>
          </footer>
        </div>

        {confirm && (
          <ConfirmSheet
            title="¿Cancelar esta reserva?"
            body="Liberarás tu lugar. Puedes volver a reservar si hay cupo."
            error={error}
            cancelLabel="Conservar lugar"
            confirmLabel="Sí, cancelar"
            danger
            pending={pending}
            onCancel={() => { setConfirm(null); setError(null); }}
            onConfirm={cancelar}
          />
        )}

        {logout && (
          <ConfirmSheet
            title="¿Cerrar sesión?"
            body="Tendrás que volver a entrar para reservar."
            error={logoutError}
            cancelLabel="Cancelar"
            confirmLabel="Cerrar sesión"
            pending={logoutPending}
            onCancel={() => { setLogout(false); setLogoutError(null); }}
            onConfirm={cerrarSesion}
          />
        )}
      </div>
    </div>
  );
}
