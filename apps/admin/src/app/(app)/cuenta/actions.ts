"use server";

import {
  actualizarAboutValue,
  crearAboutValue,
  eliminarAboutValue,
  reordenarAboutValues,
} from "@gym/data/server/about-values";
import {
  actualizarClassType,
  actualizarBloque,
  actualizarPorTraer,
  crearBloque,
  crearClassType,
  crearPorTraer,
  reordenarBloques,
  reordenarPorTraer,
} from "@gym/data/server/class-type";
import {
  actualizarCoach,
  crearCoach,
  establecerCoachActivo,
  reordenarCoaches,
} from "@gym/data/server/coach";
import {
  actualizarFacility,
  crearFacility,
  eliminarFacility,
  reordenarFacilities,
} from "@gym/data/server/facilities";
import { actualizarFaq, crearFaq, eliminarFaq, reordenarFaqs } from "@gym/data/server/faqs";
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
import { marcarLeido } from "@gym/data/server/mensajes";
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

export async function marcarMensajeLeidoAction(raw: unknown): Promise<void> {
  return marcarLeido(raw);
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
