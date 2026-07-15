"use server";

import {
  getMarcadasDelDia,
  getMarcadasDeMes,
  togglePase,
  type Presencia,
  type TogglePaseOutcome,
} from "@gym/data/server/asistencia";

/**
 * Thin write seam (ADR-0001): delegate to the DAL (Zod-validates, re-auths,
 * consumes/restores via the domain). No cache invalidation needed — (app)
 * pages read through the cookie-bound Supabase client and render dynamically,
 * so the write is seen on the next read.
 *
 * An RPC refusal arrives as `{ ok: false, message }` (typed result, NOT a
 * throw): production Next.js masks thrown Server Action messages, so the C15/C9
 * reasons ('Paquete vencido', 'Asistencia de clase ya registrada…') must travel
 * as a return value for the pase screen to toast them.
 */
export async function togglePaseAction(raw: unknown): Promise<TogglePaseOutcome> {
  return togglePase(raw);
}

/**
 * Lazy-load one past month's PRESENCE dots ("YYYY-MM") when the calendar browses outside
 * the initial window getMarcadas ships (perf wave 4/5). Thin read seam over the DAL, which
 * zod-validates the month, re-auths, and gym-scopes the RPC. The client merges the counts
 * into local state and caches the month so re-navigation is instant.
 */
export async function marcadasDeMesAction(mes: string): Promise<Presencia> {
  return getMarcadasDeMes(mes);
}

/**
 * Lazy-load ONE picked day's roster ids ("YYYY-MM-DD") when the operator selects a past day
 * outside the initial payload (which carries only today's ids; perf wave 5). Thin read seam
 * over the DAL, which zod-validates the day, re-auths, and gym-scopes the RPC. The client
 * caches the day's ids in state so its checks render and re-selection is instant.
 */
export async function marcadasDelDiaAction(fecha: string): Promise<string[]> {
  return getMarcadasDelDia(fecha);
}
