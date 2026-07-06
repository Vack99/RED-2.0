"use server";

import {
  cancelarSesion,
  crearHorarioRecurrente,
  crearSesion,
  editarSesion,
  type AgendaResultado,
  type CancelarSesionInput,
  type CrearHorarioRecurrenteInput,
  type CrearSesionInput,
  type EditarSesionInput,
} from "@gym/data/server/agenda";
import { crearClassType } from "@gym/data/server/catalog";

/**
 * Thin write seam (ADR-0001): each action delegates to the DAL, which Zod-validates,
 * re-auths, and hits the atomic RPC (or the RLS-scoped class_type insert). No cache
 * invalidation here — the (app) pages read dynamically through the cookie-bound
 * client, so a router.refresh() on the client re-reads the mutation. The DAL owns
 * every error as a typed AgendaResultado (never a throw through to the page).
 */

export async function crearSesionAction(input: CrearSesionInput): Promise<AgendaResultado<{ sesionId: string }>> {
  return crearSesion(input);
}

export async function crearHorarioRecurrenteAction(
  input: CrearHorarioRecurrenteInput,
): Promise<AgendaResultado<{ templateIds: string[] }>> {
  return crearHorarioRecurrente(input);
}

export async function editarSesionAction(input: EditarSesionInput): Promise<AgendaResultado> {
  return editarSesion(input);
}

export async function cancelarSesionAction(input: CancelarSesionInput): Promise<AgendaResultado> {
  return cancelarSesion(input);
}

export async function crearClassTypeAction(input: { name: string }): Promise<AgendaResultado<{ id: string }>> {
  return crearClassType(input);
}
