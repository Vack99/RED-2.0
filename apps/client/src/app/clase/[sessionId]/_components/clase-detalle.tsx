"use client";

import { type CSSProperties, type ReactNode, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import type { ClaseDetalleDTO, CoachDetalleDTO } from "@gym/data/server/clase-miembro";
import type { SaldoMiembroDTO } from "@gym/data/server/agenda-miembro";

import { CtaVerPlanes } from "../../../_components/cta-ver-planes";
import {
  cancelarDesdeClaseAction,
  reservarDesdeClaseAction,
  toggleFavoritoAction,
} from "../actions";

/**
 * The class-detail page (slice #59), a faithful translation of the mock's `clase` slot:
 * status hero (with the favorita heart), datos rows, coaches with bios, la sesión,
 * qué trabajamos, qué traer, and the cupo roster of REAL attendee initials. State-dependent
 * CTA — book (→ Confirmada), cancel-with-confirm (→ back to the week), disabled when
 * terminada, and "Lleno" disabled for a full class (no waitlist, PRD Implementation
 * Decisions). Occupancy + the roster are DERIVED on the server; every color is a contract
 * token, so RED hosts render RED and Forge hosts render Forge with no brand import here.
 */

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill={filled ? "currentColor" : "none"}
      stroke="currentColor"
      strokeWidth={filled ? 0 : 2}
      strokeLinejoin="round"
    >
      <path d="M12 3l2.6 6.3 6.4.5-4.9 4.1 1.6 6.2L12 17l-5.3 3.4 1.6-6.2L3.4 9.8l6.4-.5z" />
    </svg>
  );
}

const backArrow = (
  <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    <path d="M12 4l-6 6 6 6" />
  </svg>
);

const fwdArrow = (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 10h10M11 6l4 4-4 4" />
  </svg>
);

type Badge = { texto: string; clase: string };
function badgeDe(d: ClaseDetalleDTO): Badge {
  if (d.estado === "termino") return { texto: "Terminada", clase: "border-line bg-sunk text-muted" };
  if (d.miReserva) return { texto: "Reservada", clase: "border-accent/40 bg-accent-soft text-accent" };
  if (d.estado === "lleno") return { texto: "Llena", clase: "border-warning/40 bg-warning-soft text-warning" };
  return { texto: "Disponible", clase: "border-accent/40 bg-accent-soft text-accent" };
}

function FactRow({ k, v, danger }: { k: string; v: string; danger?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-line py-2.5 last:border-0">
      <span className="text-[11px] uppercase tracking-wide text-muted">{k}</span>
      <span className={`text-[13px] font-bold ${danger ? "text-warning" : "text-fg"}`}>{v}</span>
    </div>
  );
}

function CoachCard({ c }: { c: CoachDetalleDTO }) {
  return (
    <div className="flex gap-3 border-b border-line py-3.5 last:border-0">
      <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full border border-line bg-sunk text-[11px] font-bold text-accent">
        {c.iniciales}
      </span>
      <div className="min-w-0">
        <div className="text-sm font-bold text-fg">{c.nombre}</div>
        <div className="mt-0.5 text-[10px] uppercase tracking-wide text-accent">{c.especialidad}</div>
        {c.bio && <div className="mt-1.5 text-xs leading-relaxed text-muted">{c.bio}</div>}
      </div>
    </div>
  );
}

function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-muted">{children}</div>;
}

function Roster({ detalle }: { detalle: ClaseDetalleDTO }) {
  const terminada = detalle.estado === "termino";
  const full = detalle.estado === "lleno";
  const avatars = detalle.roster.slice(0, 4);
  const moreN = Math.max(0, detalle.ocupados - avatars.length);
  const estadoPips = terminada ? " s-finished" : full ? " s-full" : "";
  return (
    // .cd-roster scopes the shared ember-ignition pip layer (globals.css §3.4): one <i>
    // per seat, `lit`/`lit tip` on filled/last-lit, `ignited` fires the neon flicker on
    // mount (staggered by --i × --rp-step, capped so 20+ seats stay snappy).
    <section className="cd-roster px-6 py-4">
      <SectionLabel>Cupo</SectionLabel>
      <div className={`pips ignited${estadoPips}`}>
        {Array.from({ length: detalle.capacidad }, (_, k) => {
          const lit = k < detalle.ocupados;
          const tip = lit && k === detalle.ocupados - 1;
          return (
            <i
              key={k}
              className={lit ? (tip ? "lit tip" : "lit") : undefined}
              style={{ "--i": Math.min(k, 16) } as CSSProperties}
            />
          );
        })}
      </div>
      <div className="font-mono text-[11px] tabular-nums tracking-wide text-muted">
        {terminada ? "Clase terminada" : `${detalle.ocupados} de ${detalle.capacidad} lugares tomados`}
      </div>
      {!terminada && detalle.ocupados > 0 && (
        <div className="mt-3.5 flex gap-1.5">
          {avatars.map((ini, i) => (
            <span
              key={i}
              className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-line bg-sunk text-[9px] font-bold text-muted"
            >
              {ini}
            </span>
          ))}
          {moreN > 0 && (
            <span className="flex h-[30px] w-[30px] items-center justify-center rounded-full border border-line bg-sunk text-[9px] font-bold text-accent">
              +{moreN}
            </span>
          )}
        </div>
      )}
    </section>
  );
}

export function ClaseDetalle({
  detalle,
  saldo,
}: {
  detalle: ClaseDetalleDTO;
  saldo: SaldoMiembroDTO;
}) {
  const router = useRouter();
  const [favorita, setFavorita] = useState(detalle.favorita);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [favPending, startFavTransition] = useTransition();

  const badge = badgeDe(detalle);
  const casiLleno = detalle.estado === "casi_lleno";

  function book() {
    setError(null);
    startTransition(async () => {
      const res = await reservarDesdeClaseAction(detalle.sessionId);
      if (res.ok) router.push(`/confirmada/${detalle.sessionId}`);
      else setError(res.error);
    });
  }

  function cancel() {
    setError(null);
    startTransition(async () => {
      const res = await cancelarDesdeClaseAction(detalle.sessionId);
      if (res.ok) {
        setConfirmCancel(false);
        router.push("/reservar");
      } else setError(res.error);
    });
  }

  function toggleFavorita() {
    const optimista = !favorita;
    setFavorita(optimista);
    startFavTransition(async () => {
      const res = await toggleFavoritoAction(detalle.classTypeId);
      if (res.ok) router.refresh();
      else setFavorita(!optimista); // revert on failure
    });
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col bg-canvas">
      <header className="flex flex-none items-center justify-between px-5 pb-2 pt-4">
        <Link href="/reservar" className="flex items-center gap-2 text-muted" aria-label="Volver al horario">
          {backArrow}
          <span className="text-[10px] font-semibold uppercase tracking-[0.16em]">Horario</span>
        </Link>
        <span className="text-[10px] font-bold uppercase tracking-[0.16em] text-muted">{detalle.contexto}</span>
      </header>

      <div className="flex-1 overflow-y-auto">
        {/* Hero */}
        <section className="border-b border-line px-6 pb-6 pt-3">
          <div className="flex items-start justify-between gap-3">
            <span className="rounded-full border border-accent/40 bg-accent-soft px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-accent">
              {detalle.tipo}
            </span>
            <span className={`rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider ${badge.clase}`}>
              {badge.texto}
            </span>
          </div>
          <h1 className="mt-4 text-4xl font-extrabold uppercase leading-none tracking-tight text-fg">{detalle.tipo}</h1>
          <div className="mt-3 text-[11px] uppercase tracking-wide text-muted">
            {detalle.duracionLabel}
            {detalle.sala ? ` · ${detalle.sala}` : ""}
          </div>
          <div className="mt-1.5 text-xs text-muted">
            {detalle.fechaLarga} · {detalle.hora}–{detalle.horaFin}
          </div>
          <button
            type="button"
            onClick={toggleFavorita}
            disabled={favPending}
            aria-pressed={favorita}
            className={`mt-4 flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-[0.12em] disabled:opacity-70 ${
              favorita ? "text-accent" : "text-muted"
            }`}
          >
            <Heart filled={favorita} />
            {favorita ? "Tu favorita" : "Marcar favorita"}
          </button>
        </section>

        {/* Datos */}
        <section className="px-6 py-4">
          <SectionLabel>Datos</SectionLabel>
          <FactRow k="Hora" v={`${detalle.hora} – ${detalle.horaFin}`} />
          <FactRow k="Duración" v={detalle.duracionLabel} />
          <FactRow k="Sala" v={detalle.sala ?? "—"} />
          <FactRow k="Nivel" v={detalle.nivel ?? "—"} />
          <FactRow
            k="Cupo"
            danger={detalle.estado === "lleno"}
            v={
              detalle.estado === "termino"
                ? "—"
                : `${detalle.ocupados} / ${detalle.capacidad} · ${detalle.disponibles} libres`
            }
          />
        </section>

        {/* Coaches */}
        {detalle.coaches.length > 0 && (
          <section className="border-t border-line px-6 py-4">
            <SectionLabel>Coaches</SectionLabel>
            {detalle.coaches.map((c) => (
              <CoachCard key={c.nombre} c={c} />
            ))}
          </section>
        )}

        {/* La sesión */}
        {detalle.descripcion && (
          <section className="border-t border-line px-6 py-4">
            <SectionLabel>La sesión</SectionLabel>
            <p className="text-xs leading-relaxed text-muted">{detalle.descripcion}</p>
          </section>
        )}

        {/* Qué trabajamos */}
        {detalle.bloques.length > 0 && (
          <section className="border-t border-line px-6 py-4">
            <SectionLabel>Qué trabajamos</SectionLabel>
            <div className="flex flex-col">
              {detalle.bloques.map((b, i) => (
                <div key={i} className="flex gap-3 border-t border-line py-2.5 first:border-t-0 first:pt-0">
                  <span className="w-[62px] flex-none pt-0.5 font-mono text-[9px] font-bold uppercase tracking-wide text-accent">
                    {b.etiqueta}
                  </span>
                  {b.valor && <span className="text-[13px] leading-snug text-muted">{b.valor}</span>}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* Qué traer */}
        {detalle.porTraer.length > 0 && (
          <section className="border-t border-line px-6 py-4">
            <SectionLabel>Qué traer</SectionLabel>
            <ul className="flex flex-col gap-2.5">
              {detalle.porTraer.map((t, i) => (
                <li key={i} className="flex items-center gap-3">
                  <span className="flex h-5 w-5 flex-none items-center justify-center rounded-full bg-accent-soft text-[9px] font-bold text-accent">
                    {i + 1}
                  </span>
                  <span className="text-xs text-muted">{t}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        {/* Cupo roster */}
        <div className="border-t border-line">
          <Roster detalle={detalle} />
        </div>
      </div>

      {/* CTA */}
      <div className="flex-none border-t border-line bg-canvas px-6 pb-8 pt-4">
        {error && <p className="mb-2.5 text-center text-[11px] font-semibold text-danger">{error}</p>}
        {detalle.estado === "termino" ? (
          // termino wins over miReserva: cancel is closed once the class began (the RPC
          // would reject it), so a reserved past session reads as done, not cancellable.
          <>
            <p className="mb-2.5 text-center text-[11px] text-muted">Esta clase ya pasó.</p>
            <button type="button" disabled className="w-full cursor-default rounded-xl bg-sunk py-4 text-xs font-bold uppercase tracking-wider text-muted">
              Sesión terminada
            </button>
          </>
        ) : detalle.miReserva ? (
          <>
            <p className="mb-2.5 text-center text-[11px] text-muted">
              Ya tienes tu lugar · cancela sin costo hasta 2 h antes
            </p>
            <button
              type="button"
              onClick={() => setConfirmCancel(true)}
              className="w-full rounded-xl border border-warning/50 py-4 text-xs font-bold uppercase tracking-wider text-warning"
            >
              Cancelar reserva
            </button>
          </>
        ) : saldo.vencido ? (
          // Membership lapsed (#118 E4): reservar_clase rejects "Paquete vencido" (finite AND
          // ilimitado). paga-en-tu-gym → route to precios, not a dead-end button. After miReserva,
          // so a member who booked before lapsing can still cancel their held spot.
          <CtaVerPlanes>Tu paquete venció. Renueva en tu gimnasio para reservar.</CtaVerPlanes>
        ) : detalle.estado === "lleno" ? (
          <>
            <p className="mb-2.5 text-center text-[11px] text-muted">Clase llena. No hay lugares disponibles.</p>
            <button type="button" disabled className="w-full cursor-default rounded-xl bg-sunk py-4 text-xs font-bold uppercase tracking-wider text-muted">
              Lleno
            </button>
          </>
        ) : !saldo.ilimitado && (saldo.clasesRestantes ?? 0) <= 0 ? (
          // Finite plan depleted (audit #9): no free/trial class, no online payment
          // (paga en tu gym) — route to precios instead of a dead-end "Sin clases disponibles".
          <CtaVerPlanes>No te quedan clases en tu plan. Compra un paquete en tu gimnasio para reservar.</CtaVerPlanes>
        ) : (
          <>
            {casiLleno ? (
              <p className="mb-2.5 text-center text-[11px] font-semibold text-warning">
                Solo {detalle.disponibles} libre{detalle.disponibles === 1 ? "" : "s"} · asegura tu lugar
              </p>
            ) : saldo.ilimitado ? (
              <p className="mb-2.5 text-center text-[11px] text-muted">Reserva incluida en tu plan ilimitado.</p>
            ) : (
              <p className="mb-2.5 text-center text-[11px] text-muted">Esta reserva usa 1 de tus {saldo.clasesRestantes} clases</p>
            )}
            <button
              type="button"
              onClick={book}
              disabled={pending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-4 text-xs font-extrabold uppercase tracking-wider text-accent-fg disabled:opacity-70"
            >
              {pending ? "Reservando…" : "Reservar lugar"}
              {!pending && fwdArrow}
            </button>
          </>
        )}
      </div>

      {/* Cancel confirm sheet */}
      {confirmCancel && (
        <div className="fixed inset-0 z-40 mx-auto flex max-w-md justify-center" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Cerrar"
            onClick={() => { setConfirmCancel(false); setError(null); }}
            className="absolute inset-0 bg-black/60"
          />
          <div className="absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-3xl border-t border-line bg-canvas px-6 pb-8 pt-6">
            <h4 className="text-[17px] font-bold text-fg">¿Cancelar tu lugar?</h4>
            <p className="mt-2 text-xs leading-relaxed text-muted">
              Liberarás tu lugar para esta clase. Puedes volver a reservar si hay cupo.
            </p>
            {error && <p className="mt-2.5 text-[11px] font-semibold text-danger">{error}</p>}
            <div className="mt-4 flex gap-2.5">
              <button
                type="button"
                onClick={() => { setConfirmCancel(false); setError(null); }}
                className="flex-1 rounded-xl border border-line py-3.5 text-[11px] font-bold uppercase tracking-wider text-muted"
              >
                Conservar lugar
              </button>
              <button
                type="button"
                onClick={cancel}
                disabled={pending}
                className="flex-1 rounded-xl bg-warning py-3.5 text-[11px] font-bold uppercase tracking-wider text-ink disabled:opacity-70"
              >
                {pending ? "Cancelando…" : "Sí, cancelar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
