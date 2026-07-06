"use server";

import {
  actualizarAboutValue,
  crearAboutValue,
  eliminarAboutValue,
  reordenarAboutValues,
} from "@gym/data/server/about-values";
import {
  actualizarFacility,
  crearFacility,
  eliminarFacility,
  reordenarFacilities,
} from "@gym/data/server/facilities";
import { actualizarFaq, crearFaq, eliminarFaq, reordenarFaqs } from "@gym/data/server/faqs";
import { actualizarPaquete } from "@gym/data/server/paquetes";
import {
  actualizarPlantilla,
  crearPlantilla,
  eliminarPlantilla,
  sembrarPlantillasDefault,
} from "@gym/data/server/plantillas";
import { actualizarStat, crearStat, eliminarStat, reordenarStats } from "@gym/data/server/stats";

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

export async function crearAboutValueAction(raw: unknown): Promise<void> {
  return crearAboutValue(raw);
}
export async function actualizarAboutValueAction(raw: unknown): Promise<void> {
  return actualizarAboutValue(raw);
}
export async function eliminarAboutValueAction(raw: unknown): Promise<void> {
  return eliminarAboutValue(raw);
}
export async function reordenarAboutValuesAction(raw: unknown): Promise<void> {
  return reordenarAboutValues(raw);
}

export async function crearFacilityAction(raw: unknown): Promise<void> {
  return crearFacility(raw);
}
export async function actualizarFacilityAction(raw: unknown): Promise<void> {
  return actualizarFacility(raw);
}
export async function eliminarFacilityAction(raw: unknown): Promise<void> {
  return eliminarFacility(raw);
}
export async function reordenarFacilitiesAction(raw: unknown): Promise<void> {
  return reordenarFacilities(raw);
}

export async function crearStatAction(raw: unknown): Promise<void> {
  return crearStat(raw);
}
export async function actualizarStatAction(raw: unknown): Promise<void> {
  return actualizarStat(raw);
}
export async function eliminarStatAction(raw: unknown): Promise<void> {
  return eliminarStat(raw);
}
export async function reordenarStatsAction(raw: unknown): Promise<void> {
  return reordenarStats(raw);
}

export async function crearFaqAction(raw: unknown): Promise<void> {
  return crearFaq(raw);
}
export async function actualizarFaqAction(raw: unknown): Promise<void> {
  return actualizarFaq(raw);
}
export async function eliminarFaqAction(raw: unknown): Promise<void> {
  return eliminarFaq(raw);
}
export async function reordenarFaqsAction(raw: unknown): Promise<void> {
  return reordenarFaqs(raw);
}
