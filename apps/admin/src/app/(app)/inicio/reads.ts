import "server-only";

import { getAgendaDia, type AgendaDiaDTO, type SesionAgendaDTO } from "@gym/data/server/agenda";
import {
  getAsistenciasResumenHoy,
  getVisitasDelDia,
  type AsistenciasResumenHoy,
  type Visita,
} from "@gym/data/server/asistencia";
import type { SupabaseServer } from "@gym/data/server/supabase";
import type { Modo } from "@gym/domain/types";
import { addDays, parseDay, toIsoDay } from "@gym/format";

/**
 * /inicio's schedule-dependent reads (#328). Lives BESIDE `page.tsx`, not under
 * `_components/` — the client-seam ESLint guard restricts every `_components/**`
 * file to type-only imports of `@gym/data/server/*` (same reason `cross-seam.test.ts`
 * sits beside the Clientes `page.tsx` instead of under its `_components/`).
 */
export interface LecturaDia {
  agenda: AgendaDiaDTO | null;
  visitas: Visita[];
}

/**
 * The day's schedule + today's check-ins — issued ONLY on Cupo. Lista's day card is
 * forced to the standalone PASE DE LISTA arm and must never cost a schedule round
 * trip: on `modo === "lista"` the read is skipped ENTIRELY (the client is never
 * touched), not merely awaited and discarded once it lands — `data-seam.test.ts`
 * asserts this at the Supabase client boundary itself.
 *
 * Both legs degrade independently on Cupo, exactly like the desk's own ACCESO LIBRE
 * degradation: the schedule is an enhancement of the home screen, never its
 * precondition, so a failed read falls back to the no-hero arm instead of 500-ing
 * the door screen.
 */
export async function leerDia(modo: Modo, hoyIso: string, client?: SupabaseServer): Promise<LecturaDia> {
  if (modo === "lista") return { agenda: null, visitas: [] };

  const [agenda, visitas] = await Promise.all([
    getAgendaDia(hoyIso, client).catch((err): AgendaDiaDTO | null => {
      console.error("[inicio] schedule read failed — falling back to the PASE CTA", err);
      return null;
    }),
    getVisitasDelDia(hoyIso, client).catch((err) => {
      console.error("[inicio] attendance read failed — check-in counts show 0", err);
      return [] as Visita[];
    }),
  ]);

  return { agenda, visitas };
}

/** How many days ahead `leerProximoDia` will look once today's own agenda has no
 *  hero left (owner ruling 2026-09-01) — the hero must never sit empty while the
 *  gym has any class within a reasonable horizon, but an unmaintained schedule
 *  still has to fall back to the standalone PASE DE LISTA arm eventually. */
export const HORIZONTE_PROXIMO_DIA = 7;

export interface ProximoDia {
  fecha: string; // ISO day, gym-local
  sesiones: SesionAgendaDTO[];
}

/**
 * The first day AFTER `hoyIso` that has at least one session, within
 * `HORIZONTE_PROXIMO_DIA` days — issued ONLY when Cupo's own day is over (`page.tsx`
 * calls this exactly once `derivarDia` has already come back `null`, never
 * unconditionally, so a gym whose day still has a hero never pays for it).
 *
 * Sequential and short-circuiting on purpose: the common case — a class tomorrow —
 * costs exactly one extra round trip, the same as `leerDia`'s own single-day read.
 * A read failure on any day aborts the WHOLE search immediately and falls back to
 * the standalone CTA (this is an enhancement over the no-hero arm, never a second
 * precondition for it — the same rule `leerDia`'s legs follow).
 */
export async function leerProximoDia(hoyIso: string, client?: SupabaseServer): Promise<ProximoDia | null> {
  let cursor = parseDay(hoyIso);
  for (let i = 0; i < HORIZONTE_PROXIMO_DIA; i++) {
    cursor = addDays(cursor, 1);
    const fecha = toIsoDay(cursor);
    let agenda: AgendaDiaDTO;
    try {
      agenda = await getAgendaDia(fecha, client);
    } catch (err) {
      console.error("[inicio] next-day schedule read failed — falling back to the PASE CTA", err);
      return null;
    }
    if (agenda.sesiones.length > 0) return { fecha, sesiones: agenda.sesiones };
  }
  return null;
}

/**
 * The ASISTENCIAS · HOY hero's counts — issued ONLY on Lista (owner ruling
 * 2026-09-01, restoring what #328 dropped), the exact mirror of `leerDia` above:
 * Cupo already leads with its own class hero and must never cost this round trip,
 * so on `modo === "cupo"` the read is skipped ENTIRELY, not merely awaited and
 * discarded — `data-seam.test.ts` asserts this at the Supabase client boundary.
 *
 * Best-effort like `leerDia`'s legs: a failed read degrades to `null` (the hero
 * simply doesn't render) instead of 500-ing the door screen.
 */
export async function leerResumenAsistencias(
  modo: Modo,
  client?: SupabaseServer,
): Promise<AsistenciasResumenHoy | null> {
  if (modo === "cupo") return null;

  return getAsistenciasResumenHoy(client).catch((err) => {
    console.error("[inicio] attendance summary read failed — hero hidden", err);
    return null;
  });
}
