"use client";

// ──────────────────────────────────────────────────────────────
// Tiny localStorage-backed observable stores + React bindings.
//
// This is the single data-access seam for the whole app. Today it
// persists to localStorage and seeds from mock data; swapping it for
// Supabase later is a change confined to this file (same hook shapes).
//
// SSR-safe: state starts as the seed on both server and first client
// render, then hydrates from localStorage on mount — so there is no
// hydration mismatch.
// ──────────────────────────────────────────────────────────────

import { useEffect, useSyncExternalStore } from "react";
import {
  SEED_CLIENTES,
  SEED_COBRO,
  SEED_PAQUETES,
  SEED_PERFIL,
  SEED_PLANTILLAS,
} from "./seed";
import { DEMO_TODAY, isoDay } from "../date";
import type {
  Cliente,
  Cobro,
  Paquete,
  PaseGrid,
  Perfil,
  Plantilla,
} from "./types";

type Updater<T> = T | ((prev: T) => T);

interface Store<T> {
  key: string;
  seed: T;
  get: () => T;
  set: (next: Updater<T>) => void;
  subscribe: (fn: () => void) => () => void;
  hydrate: () => void;
}

function createStore<T>(key: string, seed: T): Store<T> {
  let state = seed;
  let hydrated = false;
  const subs = new Set<() => void>();

  const emit = () => subs.forEach((fn) => fn());

  const persist = () => {
    try {
      localStorage.setItem(key, JSON.stringify(state));
    } catch {
      /* quota / private mode — ignore */
    }
  };

  const hydrate = () => {
    if (hydrated || typeof window === "undefined") return;
    hydrated = true;
    try {
      const raw = localStorage.getItem(key);
      if (raw) {
        const parsed = JSON.parse(raw) as T;
        if (parsed != null) {
          state = parsed;
          emit();
        }
      }
    } catch {
      /* corrupt — fall back to seed */
    }
  };

  return {
    key,
    seed,
    get: () => state,
    set: (next) => {
      state =
        typeof next === "function" ? (next as (p: T) => T)(state) : next;
      persist();
      emit();
    },
    subscribe: (fn) => {
      subs.add(fn);
      return () => {
        subs.delete(fn);
      };
    },
    hydrate,
  };
}

function useStore<T>(store: Store<T>): [T, (next: Updater<T>) => void] {
  const value = useSyncExternalStore(
    store.subscribe,
    store.get,
    () => store.seed,
  );
  useEffect(() => store.hydrate(), [store]);
  return [value, store.set];
}

// ── Store instances ──────────────────────────────────────────
const paquetesStore = createStore<Paquete[]>("forge.paquetes.v2", SEED_PAQUETES);
const perfilStore = createStore<Perfil>("forge.perfil.v1", SEED_PERFIL);
const cobroStore = createStore<Cobro>("forge.cobro.v1", SEED_COBRO);
const plantillasStore = createStore<Plantilla[]>(
  "forge.plantillas.v1",
  SEED_PLANTILLAS,
);
const clientesStore = createStore<Cliente[]>("forge.clientes.v1", SEED_CLIENTES);

// Attendance grid keyed by day-offset from today → present client ids.
// Seeded with a realistic recent week so the strip shows history dots.
const PASE_SEED: PaseGrid = {
  0: [1, 4, 8, 11],
  [-1]: [2, 5, 7, 10],
  [-2]: [3, 6, 9, 12],
  [-3]: [1, 4, 11, 5],
  [-4]: [2, 8, 9, 7, 10],
  [-5]: [1, 4, 6, 12],
  [-6]: [3, 5, 8, 11],
};
const paseStore = createStore<PaseGrid>("forge.pase.v1", PASE_SEED);

// Per-client timestamp for *today's* check-in (shown on the client profile
// as "Registrada a las 07:32"). Seeded to match PASE_SEED[0].
const ASIST_TIMES_SEED: Record<number, string> = { 1: "07:30", 4: "08:30", 8: "06:30", 11: "08:30" };
const asistTimesStore = createStore<Record<number, string>>(
  "forge.asistTimes.v1",
  ASIST_TIMES_SEED,
);

// ── Public hooks ─────────────────────────────────────────────
export const usePaquetes = () => useStore(paquetesStore);
export const usePerfil = () => useStore(perfilStore);
export const useCobro = () => useStore(cobroStore);
export const usePlantillas = () => useStore(plantillasStore);
export const useClientes = () => useStore(clientesStore);
export const usePase = () => useStore(paseStore);
export const useAsistTimes = () => useStore(asistTimesStore);

// ── Non-reactive reads (for helpers / WhatsApp tokens) ───────
export const getPaquetes = () => paquetesStore.get();
export const getCobro = () => cobroStore.get();
export const getClientes = () => clientesStore.get();

// ── Pase grid helpers ────────────────────────────────────────
export function paseIds(grid: PaseGrid, offset: number): number[] {
  return grid[offset] ?? [];
}

export function isPresent(grid: PaseGrid, offset: number, id: number): boolean {
  return (grid[offset] ?? []).includes(id);
}

export function togglePase(
  set: (next: Updater<PaseGrid>) => void,
  offset: number,
  id: number,
): boolean {
  let nowPresent = false;
  set((grid) => {
    const cur = grid[offset] ?? [];
    const has = cur.includes(id);
    nowPresent = !has;
    return {
      ...grid,
      [offset]: has ? cur.filter((x) => x !== id) : [...cur, id],
    };
  });
  return nowPresent;
}

// Derive the per-client name initials (used by the perfil header).
export function perfilInicial(perfil: Perfil): string {
  const parts = (perfil.nombre || "").trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "FB";
  const short = parts.find((p) => p.length === 2);
  if (short && parts.length > 1) return short.toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
}

// Plain-text transfer block for the {datos_pago} token / share.
export function cobroTextoPago(c: Cobro = cobroStore.get()): string {
  const lines: string[] = [];
  if (c.titular?.trim()) lines.push(`Titular: ${c.titular.trim()}`);
  if (c.banco?.trim()) lines.push(`Banco: ${c.banco.trim()}`);
  if (c.clabe?.trim()) lines.push(`CLABE: ${c.clabe.trim()}`);
  if (c.metodos?.tarjeta && c.tarjeta?.trim())
    lines.push(`Tarjeta: ${c.tarjeta.trim()}`);
  return lines.join("\n");
}

export const TODAY_ISO = isoDay(DEMO_TODAY);
