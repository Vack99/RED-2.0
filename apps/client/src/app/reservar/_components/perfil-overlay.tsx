"use client";

import { type ReactNode, useEffect, useState, useTransition } from "react";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createClient } from "@gym/data/client";
import type {
  MembresiaDerivada,
  PlanMembresiaDTO,
  ProximaReservaDTO,
} from "@gym/data/server/agenda-miembro";

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

const heartMini = (
  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12 3l2.6 6.3 6.4.5-4.9 4.1 1.6 6.2L12 17l-5.3 3.4 1.6-6.2L3.4 9.8l6.4-.5z" />
  </svg>
);

function ReservaCard({
  r,
  onCancel,
  onOpen,
}: {
  r: ProximaReservaDTO;
  onCancel: () => void;
  onOpen: () => void;
}) {
  return (
    <div className="mb-3 flex overflow-hidden rounded-2xl border border-line bg-surface">
      <Link
        href={`/clase/${r.sessionId}`}
        onClick={onOpen}
        aria-label={`Ver ${r.tipo}`}
        className="flex w-[86px] flex-none flex-col items-center justify-center gap-1.5 bg-sunk px-2 py-4"
      >
        <span className="text-xl font-extrabold tabular-nums text-accent">{r.hora}</span>
        <span className="text-center text-[8.5px] font-semibold uppercase leading-tight tracking-wide text-muted">
          {r.fechaCorta}
          <br />
          {r.mesCorto}
        </span>
      </Link>
      <div className="min-w-0 flex-1 border-l border-dashed border-line p-4">
        <Link href={`/clase/${r.sessionId}`} onClick={onOpen} className="block">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-[17px] font-extrabold uppercase tracking-wide text-fg">{r.tipo}</span>
            <span className="flex-none border border-accent/40 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-accent">
              Confirmada
            </span>
            {r.favorita && (
              <span className="flex flex-none items-center gap-1 border border-accent/40 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wide text-accent">
                {heartMini}
                Favorita
              </span>
            )}
          </div>
          <div className="mt-1.5 text-[10.5px] uppercase tracking-wide text-muted">
            {r.coaches} · {r.duracionLabel}
          </div>
        </Link>
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
  href?: Route;
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

/** The "Tu plan" card (mock: mb-card): plan name, the anchor-sale price, the "N de N clases" depletion
 *  gauge (∞ + a full bar for ilimitado; hidden when there is no anchor sale), and the renovación date.
 *  Read-only — every number is server-derived; the only action opens the change-plan mode. */
function PlanCard({ m, onChange }: { m: MembresiaDerivada; onChange: () => void }) {
  const barWidth = m.ilimitado ? "100%" : `${Math.round((m.gauge?.fill ?? 0) * 100)}%`;
  return (
    <section className="mt-7">
      <div className="rounded-2xl border border-line bg-surface p-5">
        <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted">Tu plan</div>
        <div className="mt-2 text-2xl font-extrabold tracking-tight text-fg">{m.planNombre}</div>
        {m.precioDisplay && (
          <div className="mt-1 text-xs text-accent">
            {m.precioDisplay}
            {m.cadenciaLabel && <span className="text-muted"> · {m.cadenciaLabel}</span>}
          </div>
        )}

        <div className="mt-5">
          <div className="flex items-baseline justify-between">
            {m.ilimitado ? (
              <span className="text-[13px] text-fg">
                <b className="font-bold text-accent">Ilimitado</b> · sin límite este mes
              </span>
            ) : m.gauge ? (
              <span className="text-[13px] text-fg">
                <b className="font-bold text-accent">{m.gauge.usadas}</b> de {m.gauge.total} clases este mes
              </span>
            ) : (
              <span className="text-[13px] text-fg">
                <b className="font-bold text-accent">{m.clasesRestLabel}</b> clases restantes
              </span>
            )}
            {m.ilimitado ? (
              <span className="text-[10px] uppercase tracking-wide text-muted">activo</span>
            ) : (
              m.gauge && (
                <span className="text-[10px] uppercase tracking-wide text-muted">{m.gauge.restantes} restantes</span>
              )
            )}
          </div>
          {/* The depletion bar only renders when there is a denominator (ilimitado = full; a gauge = fill).
              A finite plan with no anchor sale shows just the count above. */}
          {(m.ilimitado || m.gauge) && (
            <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-sunk">
              <div className="h-full rounded-full bg-accent" style={{ width: barWidth }} />
            </div>
          )}
        </div>

        {m.renovacionDisplay && (
          <div className="mt-3 text-[11px] text-muted">
            Renueva el <b className="font-semibold text-accent">{m.renovacionDisplay}</b>
          </div>
        )}

        <button
          type="button"
          onClick={onChange}
          className="mt-5 w-full rounded-xl border border-line py-3 text-[10px] font-bold uppercase tracking-wider text-muted"
        >
          Cambiar plan
        </button>
      </div>
    </section>
  );
}

/** One row in the "Cambiar plan" list (mock: mb-plan): the marketing name, price, cadence, and subtitle,
 *  with the member's current plan marked and disabled. "Elegir" opens the paga-en-tu-gym confirm — the
 *  client app NEVER writes balance or catalog, so there is no instant swap (the mock's is mock-only). */
function PlanRow({ p, onPick }: { p: PlanMembresiaDTO; onPick: () => void }) {
  const hi = p.popular && !p.current;
  const badge = p.current ? "Tu plan actual" : hi ? (p.badge ?? "Más popular") : null;
  return (
    <div
      className={`relative mb-3.5 rounded-2xl border bg-surface p-[18px] ${
        hi ? "border-accent" : "border-line"
      }`}
    >
      {badge && (
        <span
          className={`absolute -top-2 left-4 px-2 py-0.5 text-[8.5px] font-bold uppercase tracking-wide ${
            p.current ? "bg-sunk text-muted" : "bg-accent text-white"
          }`}
        >
          {badge}
        </span>
      )}
      <div className="flex items-baseline justify-between">
        <span className={`text-base font-bold ${hi ? "text-accent" : "text-fg"}`}>{p.name}</span>
        <span className="text-[22px] font-extrabold tabular-nums text-fg">{p.precioLabel}</span>
      </div>
      {p.cadence && <div className="mt-0.5 text-[10.5px] text-muted">{p.cadence}</div>}
      {p.subtitle && <div className="mt-2 text-[11.5px] leading-snug text-muted">{p.subtitle}</div>}
      {p.current ? (
        <button
          type="button"
          disabled
          className="mt-3.5 w-full rounded-lg border border-line py-3 text-[10px] font-bold uppercase tracking-wider text-muted-soft"
        >
          Plan actual
        </button>
      ) : (
        <button
          type="button"
          onClick={onPick}
          className={`mt-3.5 w-full rounded-lg py-3 text-[10px] font-bold uppercase tracking-wider ${
            hi ? "bg-accent text-white" : "border border-line text-fg"
          }`}
        >
          Elegir
        </button>
      )}
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
  notificaciones,
  marca,
  membresia,
  planes,
}: {
  open: boolean;
  onClose: () => void;
  nombre: string;
  iniciales: string;
  desde: string | null;
  reservas: ProximaReservaDTO[];
  notificaciones: boolean;
  marca: string;
  membresia: MembresiaDerivada | null;
  planes: PlanMembresiaDTO[];
}) {
  const [shown, setShown] = useState(false);
  // The overlay's sub-view: the hub, or the "Cambiar plan" catalog list (the mock's data-pmode).
  const [mode, setMode] = useState<"hub" | "plans">("hub");
  // The plan the socio tapped "Elegir" on — drives the paga-en-tu-gym confirm sheet (no write).
  const [picked, setPicked] = useState<PlanMembresiaDTO | null>(null);
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
    setMode("hub");
    setPicked(null);
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
          {mode === "plans" ? (
            <div>
              <button
                type="button"
                onClick={() => { setMode("hub"); setPicked(null); }}
                className="mb-4 inline-flex items-center gap-2 py-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted"
              >
                {backArrow}
                Volver a mi perfil
              </button>
              <div className="mb-3.5 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Cambiar plan</div>
              {planes.length > 0 ? (
                planes.map((p) => <PlanRow key={p.id} p={p} onPick={() => setPicked(p)} />)
              ) : (
                <p className="text-xs leading-relaxed text-muted">
                  Aún no hay planes publicados. Pregunta en recepción por las opciones disponibles.
                </p>
              )}
              <p className="mt-4 text-[11px] leading-relaxed text-muted-soft">
                Los pagos se gestionan directamente en tu gimnasio. Al elegir un plan te explicamos cómo
                completarlo en recepción.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-4 py-1.5">
                <span className="flex h-14 w-14 flex-none items-center justify-center rounded-full border border-line bg-surface text-sm font-bold text-accent">
                  {iniciales}
                </span>
                <div className="min-w-0">
                  <div className="truncate text-[22px] font-extrabold tracking-tight text-fg">{nombre}</div>
                  {desde && <div className="mt-1 text-[10px] uppercase tracking-wide text-muted">Miembro desde {desde}</div>}
                </div>
              </div>

              {membresia && <PlanCard m={membresia} onChange={() => setMode("plans")} />}

              <section className="mt-7">
                <div className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">Próximas reservas</div>
                {reservas.length > 0 ? (
                  reservas.map((r) => (
                    <ReservaCard
                      key={r.sessionId}
                      r={r}
                      onCancel={() => { setError(null); setConfirm(r); }}
                      onOpen={onClose}
                    />
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
            </>
          )}
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

        {picked && (
          <ConfirmSheet
            title={`Cambiar a ${picked.name}`}
            body={`Los pagos se realizan directamente en tu gimnasio. Pasa a recepción para activar ${picked.name} (${picked.precioLabel}); el equipo lo aplica al confirmar tu pago. No se cobra nada desde la app.`}
            error={null}
            cancelLabel="Cancelar"
            confirmLabel="Entendido"
            pending={false}
            onCancel={() => setPicked(null)}
            onConfirm={() => setPicked(null)}
          />
        )}
      </div>
    </div>
  );
}
