"use server";

import {
  actualizarCoach,
  crearCoach,
  establecerCoachActivo,
  reordenarCoaches,
} from "@gym/data/server/coach";
import {
  actualizarBloque,
  actualizarClassType,
  actualizarPorTraer,
  crearBloque,
  crearClassType,
  crearPorTraer,
  reordenarBloques,
  reordenarPorTraer,
} from "@gym/data/server/class-type";
import {
  actualizarPaquete,
  actualizarPaqueteMarketing,
  setPlanFeatures,
} from "@gym/data/server/paquetes";
import {
  actualizarPlantilla,
  crearPlantilla,
  eliminarPlantilla,
  sembrarPlantillasDefault,
} from "@gym/data/server/plantillas";

/** Thin write seams over the DAL. (app) reads are dynamic (cookie-bound), so the client
 *  router.refresh()es after a successful write — no cache invalidation needed (matches togglePaseAction). */
export async function crearPlantillaAction(raw: unknown): Promise<void> {
  return crearPlantilla(raw);
}

export async function actualizarPlantillaAction(raw: unknown): Promise<void> {
  return actualizarPlantilla(raw);
}

export async function eliminarPlantillaAction(raw: unknown): Promise<void> {
  return eliminarPlantilla(raw);
}

export async function sembrarPlantillasDefaultAction(): Promise<void> {
  return sembrarPlantillasDefault();
}

export async function actualizarPaqueteAction(raw: unknown): Promise<void> {
  return actualizarPaquete(raw);
}

export async function crearCoachAction(raw: unknown): Promise<void> {
  return crearCoach(raw);
}

export async function actualizarCoachAction(raw: unknown): Promise<void> {
  return actualizarCoach(raw);
}

export async function establecerCoachActivoAction(raw: unknown): Promise<void> {
  return establecerCoachActivo(raw);
}

export async function reordenarCoachesAction(raw: unknown): Promise<void> {
  return reordenarCoaches(raw);
}

export async function crearClassTypeAction(raw: unknown): Promise<void> {
  return crearClassType(raw);
}

export async function actualizarClassTypeAction(raw: unknown): Promise<void> {
  return actualizarClassType(raw);
}

export async function crearBloqueAction(raw: unknown): Promise<void> {
  return crearBloque(raw);
}

export async function actualizarBloqueAction(raw: unknown): Promise<void> {
  return actualizarBloque(raw);
}

export async function reordenarBloquesAction(raw: unknown): Promise<void> {
  return reordenarBloques(raw);
}

export async function crearPorTraerAction(raw: unknown): Promise<void> {
  return crearPorTraer(raw);
}

export async function actualizarPorTraerAction(raw: unknown): Promise<void> {
  return actualizarPorTraer(raw);
}

export async function reordenarPorTraerAction(raw: unknown): Promise<void> {
  return reordenarPorTraer(raw);
}

export async function actualizarPaqueteMarketingAction(raw: unknown): Promise<void> {
  return actualizarPaqueteMarketing(raw);
}

export async function setPlanFeaturesAction(raw: unknown): Promise<void> {
  return setPlanFeatures(raw);
}
