"use server";

import { actualizarPaquete } from "@/lib/data/paquetes";
import {
  actualizarPlantilla,
  crearPlantilla,
  eliminarPlantilla,
  sembrarPlantillasDefault,
} from "@/lib/data/plantillas";

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
