"use server";

import {
  getMarcadasDeMes,
  getVisitasDelDia,
  togglePase,
  type Presencia,
  type TogglePaseOutcome,
  type Visita,
} from "@gym/data/server/asistencia";

/**
 * Thin write seam (ADR-0001): delegate to the DAL (Zod-validates, re-auths,
 * consumes/restores via the domain). No cache invalidation needed — (app)
 * pages read through the cookie-bound Supabase client and render dynamically,
 * so the write is seen on the next read.
 *
 * An RPC refusal arrives as `{ ok: false, message }` (typed result, NOT a
 * throw): production Next.js masks thrown Server Action messages, so the reason
 * ('Paquete vencido', the C9 vence gate) must travel as a return value for the
 * pase screen to toast it.
 *
 * Pass-through, `sessionId` included: the desk sends the class it marked in (#89),
 * the ficha sends none (an ACCESO LIBRE visit). The DAL validates either shape.
 */
export async function togglePaseAction(raw: unknown): Promise<TogglePaseOutcome> {
  return togglePase(raw);
}

/**
 * Lazy-load one past month's PRESENCE dots ("YYYY-MM") when the calendar browses outside
 * the initial window getMarcadas ships. Thin read seam over the DAL, which
 * zod-validates the month, re-auths, and gym-scopes the RPC. The client merges the counts
 * into local state and caches the month so re-navigation is instant.
 */
export async function marcadasDeMesAction(mes: string): Promise<Presencia> {
  return getMarcadasDeMes(mes);
}

/**
 * Lazy-load ONE picked day's VISITS ("YYYY-MM-DD") when the operator selects a past day
 * outside the initial payload (which carries only today's). Thin read seam over the DAL,
 * which zod-validates the day, re-auths, and gym-scopes the read. The client caches the
 * day's visits in state so its checks render and re-selection is instant.
 */
export async function visitasDelDiaAction(fecha: string): Promise<Visita[]> {
  return getVisitasDelDia(fecha);
}
