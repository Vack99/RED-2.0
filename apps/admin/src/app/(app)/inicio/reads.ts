import "server-only";

import { getAgendaDia, type AgendaDiaDTO } from "@gym/data/server/agenda";
import { getVisitasDelDia, type Visita } from "@gym/data/server/asistencia";
import type { SupabaseServer } from "@gym/data/server/supabase";
import type { Modo } from "@gym/domain/types";

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
