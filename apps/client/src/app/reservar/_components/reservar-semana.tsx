"use client";

import { type CSSProperties, type ReactNode, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import type {
  AgendaSemanaMiembroDTO,
  PerfilResumenMiembroDTO,
  SaldoMiembroDTO,
  SesionMiembroDTO,
} from "@gym/data/server/agenda-miembro";

import { presentarEstadoReserva, type TonoReserva } from "../../../lib/reserva-vista";
import { reservarClaseAction } from "../actions";
import { PerfilOverlay } from "./perfil-overlay";

/**
 * The Reservar week + booking flow (slice #57). A client island: the day picker
 * switches days over the whole-week DTO the server resolved (no refetch), and tapping
 * a card opens the bottom-sheet summary — the mock's ticket — which books in one tap
 * and morphs in place into the confirmed state. Occupancy + the member's own
 * "Reservada" flag are DERIVED on the server; booking calls the atomic RPC and then
 * revalidates, so the list behind the sheet re-reads real spots (never a client
 * spots--). Brand-neutral: every color is a contract token.
 */

const NUM_TONE: Record<TonoReserva, string> = {
  open: "text-accent",
  full: "text-danger",
  finished: "text-muted",
};

/** Filled heart glyph — the "Tu favorita" mark, rendered wherever the mock tags a favorite. */
function HeartMini() {
  return (
    <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 3l2.6 6.3 6.4.5-4.9 4.1 1.6 6.2L12 17l-5.3 3.4 1.6-6.2L3.4 9.8l6.4-.5z" />
    </svg>
  );
}

/** Two-letter avatar initials from a coach name ("Marisa" → "MA"). */
function inicialesCoach(nombre: string): string {
  const p = nombre.trim().split(/\s+/).filter(Boolean);
  return ((p[0]?.[0] ?? "") + (p[1]?.[0] ?? p[0]?.[1] ?? "")).toUpperCase();
}

const CONFETTI_COLORS = ["var(--yellow)", "var(--red)", "var(--fg)", "var(--yellow-soft)"];
const CONFETTI = Array.from({ length: 20 }, (_, i) => {
  const ang = Math.PI * 2 * (i / 20) - Math.PI / 2;
  const dist = 52 + (i % 3) * 18;
  return {
    dx: `${Math.round(Math.cos(ang) * dist)}px`,
    dy: `${Math.round(Math.sin(ang) * dist)}px`,
    color: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
    delay: `${(1.04 + i * 0.006).toFixed(3)}s`,
  };
});

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

function ClassCard({ sesion, onOpen }: { sesion: SesionMiembroDTO; onOpen: () => void }) {
  const vista = presentarEstadoReserva(sesion.estado, sesion.disponibles, sesion.miReserva);

  return (
    <button
      type="button"
      onClick={onOpen}
      className={`flex w-full overflow-hidden rounded-2xl border text-left transition-colors ${
        vista.reservada ? "border-accent/50" : "border-line"
      } bg-surface ${vista.atenuada ? "opacity-60" : ""}`}
    >
      <div className="flex min-w-0 flex-1 flex-col p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <span className="truncate text-lg font-bold uppercase tracking-wide text-fg">
                {sesion.tipo}
              </span>
              {sesion.favorita && (
                <span className="flex-none text-accent" aria-label="Tu favorita">
                  <HeartMini />
                </span>
              )}
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
          <span className="bg-accent px-3 py-2 text-[9px] font-bold uppercase tracking-wider text-white">
            {vista.cta}
          </span>
        ) : vista.reservada ? (
          <span className="flex items-center gap-1 border border-accent/40 bg-accent-soft px-2.5 py-2 text-[8.5px] font-bold uppercase tracking-wide text-accent">
            <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
              <path d="M20 6L9 17l-5-5" />
            </svg>
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
    </button>
  );
}

type Badge = { texto: string; clase: string };
function badgeDe(sesion: SesionMiembroDTO): Badge {
  if (sesion.estado === "termino") return { texto: "Terminada", clase: "border-line bg-sunk text-muted" };
  if (sesion.miReserva) return { texto: "Reservada", clase: "border-accent/40 bg-accent-soft text-accent" };
  if (sesion.estado === "lleno") return { texto: "Llena", clase: "border-danger/40 bg-danger-soft text-danger" };
  if (sesion.estado === "casi_lleno")
    return { texto: "Pocos lugares", clase: "border-danger/40 bg-danger-soft text-danger" };
  return { texto: "Disponible", clase: "border-accent/40 bg-accent-soft text-accent" };
}

function Cell({ k, v, few }: { k: string; v: string; few?: boolean }) {
  return (
    <div className="bg-surface px-3.5 py-3">
      <div className="text-[8px] font-bold uppercase tracking-[0.12em] text-muted">{k}</div>
      <div className={`mt-1 text-sm font-bold ${few ? "text-danger" : "text-fg"}`}>{v}</div>
    </div>
  );
}

const arrow = (
  <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M5 10h10M11 6l4 4-4 4" />
  </svg>
);

function SummarySheet({
  sesion,
  saldo,
  pending,
  error,
  onBook,
  onClose,
}: {
  sesion: SesionMiembroDTO;
  saldo: SaldoMiembroDTO;
  pending: boolean;
  error: string | null;
  onBook: () => void;
  onClose: () => void;
}) {
  const badge = badgeDe(sesion);
  const nombres = sesion.coaches === "Por asignar" ? [] : sesion.coaches.split(" · ");
  const cupoTexto =
    sesion.estado === "termino" ? "—" : sesion.disponibles <= 0 ? "Lleno" : `${sesion.disponibles} libre${sesion.disponibles === 1 ? "" : "s"}`;
  const cupoFew = sesion.estado === "lleno" || sesion.estado === "casi_lleno";

  let cta: ReactNode;
  if (sesion.miReserva) {
    cta = (
      <>
        <p className="mb-2.5 text-center text-[11px] text-muted">Ya tienes tu lugar en esta clase.</p>
        <button type="button" onClick={onClose} className="w-full rounded-xl border border-line py-4 text-xs font-bold uppercase tracking-wider text-muted">
          Entendido
        </button>
      </>
    );
  } else if (sesion.estado === "termino") {
    cta = (
      <>
        <p className="mb-2.5 text-center text-[11px] text-muted">Esta clase ya pasó.</p>
        <button type="button" disabled className="w-full cursor-default rounded-xl bg-sunk py-4 text-xs font-bold uppercase tracking-wider text-muted">
          Sesión terminada
        </button>
      </>
    );
  } else if (sesion.estado === "lleno") {
    cta = (
      <>
        <p className="mb-2.5 text-center text-[11px] text-muted">Clase llena. No hay lugares disponibles.</p>
        <button type="button" disabled className="w-full cursor-default rounded-xl bg-sunk py-4 text-xs font-bold uppercase tracking-wider text-muted">
          Sin lugares
        </button>
      </>
    );
  } else {
    const nota =
      sesion.estado === "casi_lleno" ? (
        <p className="mb-2.5 text-center text-[11px] font-semibold text-danger">
          Solo {sesion.disponibles} libre{sesion.disponibles === 1 ? "" : "s"} · asegura tu lugar
        </p>
      ) : saldo.ilimitado ? (
        <p className="mb-2.5 text-center text-[11px] text-muted">Reserva incluida en tu plan ilimitado.</p>
      ) : (
        <p className="mb-2.5 text-center text-[11px] text-muted">
          Usa 1 de tus {saldo.clasesRestantes} clases
        </p>
      );
    cta = (
      <>
        {error && <p className="mb-2.5 text-center text-[11px] font-semibold text-danger">{error}</p>}
        {nota}
        <button
          type="button"
          onClick={onBook}
          disabled={pending}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-4 text-xs font-extrabold uppercase tracking-wider text-white disabled:opacity-70"
        >
          {pending ? "Reservando…" : "Reservar lugar"}
          {!pending && arrow}
        </button>
      </>
    );
  }

  return (
    <>
      <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
      <div className="flex items-center justify-between">
        <span className="rounded-full border border-line bg-sunk px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider text-muted">
          {sesion.tipo}
        </span>
        <span className={`rounded-full border px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider ${badge.clase}`}>
          {badge.texto}
        </span>
      </div>

      <h2 className="mt-3 text-3xl font-extrabold tracking-tight text-fg">{sesion.tipo}</h2>
      <p className="mt-1.5 text-xs text-muted">
        <b className="font-semibold text-fg tabular-nums">
          {sesion.hora}–{sesion.horaFin}
        </b>{" "}
        · {sesion.duracionLabel}
      </p>
      {sesion.favorita && (
        <span className="mt-2 inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-accent">
          <HeartMini />
          Tu favorita
        </span>
      )}

      <div className="mt-4 flex items-center gap-2.5 rounded-xl border border-line bg-surface px-3 py-2.5">
        <span className="flex">
          {nombres.length ? (
            nombres.map((n, i) => (
              <span
                key={n}
                style={{ marginLeft: i ? "-7px" : 0 }}
                className="flex h-6 w-6 items-center justify-center rounded-full border border-line bg-sunk text-[9px] font-bold text-accent"
              >
                {inicialesCoach(n)}
              </span>
            ))
          ) : (
            <span className="flex h-6 w-6 items-center justify-center rounded-full border border-line bg-sunk text-[9px] font-bold text-muted">
              —
            </span>
          )}
        </span>
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold text-fg">{sesion.coaches}</div>
          <div className="text-[9px] uppercase tracking-wide text-muted">{nombres.length > 1 ? "Coaches" : "Coach"}</div>
        </div>
      </div>

      <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-line bg-line">
        <Cell k="Duración" v={sesion.duracionLabel} />
        <Cell k="Sala" v={sesion.sala ?? "—"} />
        <Cell k="Nivel" v={sesion.nivel ?? "—"} />
        <Cell k="Cupo" v={cupoTexto} few={cupoFew} />
      </div>

      {sesion.descripcion && <p className="mt-3.5 text-xs leading-relaxed text-muted">{sesion.descripcion}</p>}

      <div className="mt-4">{cta}</div>
    </>
  );
}

function ConfirmedSheet({
  sesion,
  diaLabel,
  onClose,
}: {
  sesion: SesionMiembroDTO;
  diaLabel: string;
  onClose: () => void;
}) {
  return (
    <>
      <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-line" />
      <div className="text-center">
        <div className="rvc-check">
          <span className="rvc-glow" />
          <span className="rvc-confetti">
            {CONFETTI.map((c, i) => (
              <i
                key={i}
                style={
                  {
                    background: c.color,
                    animationDelay: c.delay,
                    "--dx": c.dx,
                    "--dy": c.dy,
                  } as CSSProperties
                }
              />
            ))}
          </span>
          <svg className="rvc-svg" viewBox="0 0 100 100">
            <path className="rvc-ring rvc-top" pathLength={100} d="M15 50 A35 35 0 0 1 85 50" />
            <path className="rvc-ring rvc-bot" pathLength={100} d="M85 50 A35 35 0 0 1 15 50" />
            <path className="rvc-tick" pathLength={100} d="M33 51 L45 63 L68 37" />
          </svg>
        </div>
        <div className="mt-3.5 text-2xl font-extrabold tracking-tight text-fg">Reserva confirmada</div>
        <p className="mt-2 text-xs leading-relaxed text-muted">¡Estás dentro! Tu lugar está apartado.</p>
        <div className="mx-auto my-5 h-0.5 w-8 rounded-full bg-line" />
        <div className="text-5xl font-extrabold leading-none tracking-tight tabular-nums text-fg">{sesion.hora}</div>
        <div className="mt-3 text-xl font-bold text-fg">{sesion.tipo}</div>
        <p className="mt-2 text-xs text-muted">
          {diaLabel} · <b className="font-semibold text-muted">{sesion.sala ?? "Estudio"}</b> · termina {sesion.horaFin}
        </p>
      </div>
      <button
        type="button"
        onClick={onClose}
        className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-accent py-4 text-xs font-extrabold uppercase tracking-wider text-white"
      >
        Reservar otra
      </button>
    </>
  );
}

type SheetState = { sesion: SesionMiembroDTO; mode: "summary" | "confirmed" };

export function ReservarSemana({
  semana,
  saldo,
  nombre,
  iniciales,
  perfil,
}: {
  semana: AgendaSemanaMiembroDTO;
  saldo: SaldoMiembroDTO;
  nombre: string;
  iniciales: string;
  perfil: PerfilResumenMiembroDTO;
}) {
  const hoyIdx = semana.dias.findIndex((d) => d.esHoy);
  const [sel, setSel] = useState(hoyIdx >= 0 ? hoyIdx : 0);
  const [sheet, setSheet] = useState<SheetState | null>(null);
  const [shown, setShown] = useState(false);
  const [perfilOpen, setPerfilOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const dia = semana.dias[sel];

  useEffect(() => {
    if (sheet) {
      const id = requestAnimationFrame(() => setShown(true));
      return () => cancelAnimationFrame(id);
    }
  }, [sheet]);

  function openSheet(sesion: SesionMiembroDTO) {
    setError(null);
    setSheet({ sesion, mode: "summary" });
  }
  function closeSheet() {
    setShown(false);
    setError(null);
    setTimeout(() => setSheet(null), 300);
  }
  function book() {
    if (!sheet) return;
    const { sesion } = sheet;
    setError(null);
    startTransition(async () => {
      const res = await reservarClaseAction(sesion.id);
      if (res.ok) {
        setSheet({ sesion, mode: "confirmed" });
        router.refresh();
      } else {
        setError(res.error);
      }
    });
  }

  return (
    <main className="mx-auto w-full max-w-md px-4 pb-10">
      <header className="flex items-start justify-between px-2 pt-6">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-[0.2em] text-accent">Reservar clase</div>
          <h1 className="mt-2 text-3xl font-extrabold uppercase leading-none tracking-tight text-fg">
            Esta semana
          </h1>
        </div>
        <button
          type="button"
          aria-label="Perfil"
          onClick={() => setPerfilOpen(true)}
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
              <span className={`text-[9px] font-bold uppercase tracking-wide ${activo ? "text-fg" : "text-muted"}`}>
                {d.weekday}
              </span>
              <span className={`text-2xl font-extrabold tabular-nums leading-none ${activo ? "text-accent" : "text-fg"}`}>
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
          dia.sesiones.map((s) => <ClassCard key={s.id} sesion={s} onOpen={() => openSheet(s)} />)
        ) : (
          <div className="px-6 py-12 text-center">
            <div className="text-base font-bold uppercase tracking-wide text-fg">Sin clases este día</div>
            <p className="mt-2 text-sm text-muted">Elige otro día de la semana para ver el horario.</p>
          </div>
        )}
      </section>

      <footer className="mt-6 px-2 text-center">
        <p className="text-[11px] text-muted">Cancela sin costo hasta 2 h antes de la clase.</p>
      </footer>

      {sheet && (
        <div className="fixed inset-0 z-40" role="dialog" aria-modal="true">
          <button
            type="button"
            aria-label="Cerrar"
            onClick={closeSheet}
            className={`absolute inset-0 bg-black/60 transition-opacity duration-300 ${shown ? "opacity-100" : "opacity-0"}`}
          />
          <div
            className={`absolute inset-x-0 bottom-0 mx-auto max-w-md rounded-t-3xl border-t border-line bg-canvas px-6 pb-8 pt-3 transition-transform duration-300 ${
              shown ? "translate-y-0" : "translate-y-full"
            }`}
          >
            {sheet.mode === "confirmed" ? (
              <ConfirmedSheet sesion={sheet.sesion} diaLabel={`${dia.weekday} ${dia.dnum}`} onClose={closeSheet} />
            ) : (
              <SummarySheet
                sesion={sheet.sesion}
                saldo={saldo}
                pending={pending}
                error={error}
                onBook={book}
                onClose={closeSheet}
              />
            )}
          </div>
        </div>
      )}

      <PerfilOverlay
        open={perfilOpen}
        onClose={() => setPerfilOpen(false)}
        nombre={nombre}
        iniciales={iniciales}
        desde={perfil.desde}
        reservas={perfil.reservas}
      />
    </main>
  );
}
