"use client";

/* PROTOTYPE — throwaway (#89). Delete with the rest of _prototype/. */

import * as React from "react";

/** The context a mark belongs to: a class session id, or open access. */
export const LIBRE = "libre";

export interface Marca {
  id: string;
  clienteId: string;
  /** `LIBRE` or a class_session id. */
  ctx: string;
  /** "HH:MM" wall clock, or "—" for a seeded row whose hora we didn't fetch. */
  hora: string;
}

let seq = 0;

function ahora(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

/**
 * The whole point of the prototype: attendance as a LIST of timestamped visit
 * events, not a per-day set of cliente ids. Two classes in one day is simply two
 * entries. Every surveyed product (PushPress, Vagaro, Wodify, Trainingym, Arketa…)
 * stores one row per visit — none stores a per-day flag. Nothing is persisted here:
 * taps are in-memory only.
 */
export function useMarcasProto(seedClienteIds: string[]) {
  const [marcas, setMarcas] = React.useState<Marca[]>(() =>
    seedClienteIds.map((clienteId) => ({ id: `seed-${seq++}`, clienteId, ctx: LIBRE, hora: "—" })),
  );

  const marcar = React.useCallback((clienteId: string, ctx: string) => {
    setMarcas((m) => [...m, { id: `m-${seq++}`, clienteId, ctx, hora: ahora() }]);
  }, []);

  const quitar = React.useCallback((id: string) => {
    setMarcas((m) => m.filter((x) => x.id !== id));
  }, []);

  /** PushPress's "Move to Class" / "Move to Open Gym": re-attribute a visit after the fact. */
  const mover = React.useCallback((id: string, ctx: string) => {
    setMarcas((m) => m.map((x) => (x.id === id ? { ...x, ctx } : x)));
  }, []);

  const toggle = React.useCallback((clienteId: string, ctx: string) => {
    setMarcas((m) => {
      const hit = m.find((x) => x.clienteId === clienteId && x.ctx === ctx);
      if (hit) return m.filter((x) => x !== hit);
      return [...m, { id: `m-${seq++}`, clienteId, ctx, hora: ahora() }];
    });
  }, []);

  return { marcas, marcar, quitar, mover, toggle };
}

/** Marks in one context. */
export function enCtx(marcas: Marca[], ctx: string): Marca[] {
  return marcas.filter((m) => m.ctx === ctx);
}

/** Distinct people marked anywhere today — the "accesos únicos" number. */
export function personas(marcas: Marca[]): number {
  return new Set(marcas.map((m) => m.clienteId)).size;
}

/**
 * The class whose start is nearest the current wall clock, within 90 minutes —
 * Zen Planner's kiosk rule ("your current class of the day will automatically be
 * highlighted and selected"). Falls back to open access, which is the honest
 * default for a gym with no maintained schedule.
 */
export function sesionCercana(sesiones: { id: string; hora: string }[]): string {
  if (sesiones.length === 0) return LIBRE;
  const d = new Date();
  const min = d.getHours() * 60 + d.getMinutes();
  let mejor = sesiones[0];
  let dist = Infinity;
  for (const s of sesiones) {
    const [h, m] = s.hora.split(":").map(Number);
    const delta = Math.abs(h * 60 + m - min);
    if (delta < dist) {
      dist = delta;
      mejor = s;
    }
  }
  return dist <= 90 ? mejor.id : LIBRE;
}

/**
 * Bookings per session, with a clearly-fake stand-in.
 *
 * Every gym currently has ZERO reservations for today (red-demo's 341 bookings are
 * historical), so a "booked members first" design would render invisible against
 * real data. Where a session has real bookings this returns them untouched; where it
 * has none it synthesizes a deterministic, evenly-spaced pick so the affordance can
 * be judged. `simulado` tells the UI to say so on screen — never pass fake data off
 * as real. Delete the fallback when bookings exist.
 */
export function reservasPorSesion(
  sesiones: { id: string }[],
  clientes: { id: string }[],
  reales: Record<string, string[]>,
): { porSesion: Record<string, string[]>; simulado: boolean } {
  const porSesion: Record<string, string[]> = {};
  let simulado = false;

  sesiones.forEach((s, i) => {
    const real = reales[s.id];
    if (real && real.length > 0) {
      porSesion[s.id] = real;
      return;
    }
    if (clientes.length === 0) {
      porSesion[s.id] = [];
      return;
    }
    simulado = true;
    const cuantos = Math.min(3 + (i % 3), clientes.length);
    const paso = Math.max(1, Math.floor(clientes.length / (cuantos + 1)));
    const ids = new Set<string>();
    for (let k = 0; k < cuantos; k++) {
      ids.add(clientes[(k * paso + i * 5) % clientes.length].id);
    }
    porSesion[s.id] = [...ids];
  });

  return { porSesion, simulado };
}

export function Aviso() {
  return (
    <div
      style={{
        padding: "7px 22px",
        background: "var(--yellow-soft)",
        borderBottom: "1px solid var(--yellow-edge)",
        fontSize: 10.5,
        fontWeight: 700,
        letterSpacing: 0.8,
        color: "var(--gold)",
        textTransform: "uppercase",
      }}
    >
      Prototipo · nada se guarda · los taps son locales
    </div>
  );
}
