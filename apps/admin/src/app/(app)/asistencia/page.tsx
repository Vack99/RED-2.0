import { getAgendaDia, type SesionAgendaDTO } from "@gym/data/server/agenda";
import { getMarcadas, getReservasDelDia } from "@gym/data/server/asistencia";
import { getClientesParaPase } from "@gym/data/server/clientes";
import { getOperatorGym } from "@gym/data/server/gym";
import { hoyIsoEnZona, horaEnZona } from "@gym/format";
import { topTag } from "@gym/ui/forge/agenda/session-card";

import { AsistenciaScreen, type SesionDelDia } from "./_components/asistencia";
import { LIBRE, sesionCercana } from "./_components/marcadas";

/**
 * The desk names a class exactly as the Agenda does: an evento especial reads by its own
 * name (an unnamed one reads "Especial"), everything else by its class type. Reuses the
 * Agenda card's own `topTag` — `isNext: false` because the pill has no "A continuación"
 * slot for the especial name to lose to, which is the only thing `muestraEspecial` decides.
 */
function etiquetaSesion(s: SesionAgendaDTO): string {
  return topTag({ isNext: false, isSpecial: s.esEspecial, specialName: s.nombreEspecial }) ?? s.tipo;
}

export default async function Page() {
  const { timezone: tz } = await getOperatorGym();
  const hoyIso = hoyIsoEnZona(tz);

  const [clientes, marcadas] = await Promise.all([getClientesParaPase(), getMarcadas()]);

  // The schedule is an ENHANCEMENT of the desk, never its precondition: a gym with no
  // maintained schedule renders ACCESO LIBRE + the full roster by design, so a failing
  // agenda read degrades to exactly THAT instead of 500-ing the door screen — the one
  // screen that must open when someone is standing at it. (There is no error.tsx in this
  // app; the degradation is here, in the read.) The assignments are ordered so a partial
  // failure keeps whatever already succeeded: lose the bookings and the pills still work,
  // only the CON RESERVA grouping goes. getAgendaDia ensures the week is materialized
  // first (ADR-0010) — an idempotent write, and the intended one: the desk reads the same
  // schedule the Agenda maintains, never a second projection of it.
  let sesiones: SesionDelDia[] = [];
  let reservas: Record<string, string[]> = {};
  let ctxInicial: string = LIBRE;
  try {
    const agenda = await getAgendaDia(hoyIso);
    sesiones = agenda.sesiones.map((s) => ({
      id: s.id,
      hora: horaEnZona(s.startsAt, tz),
      tipo: etiquetaSesion(s),
      capacidad: s.capacidad,
    }));
    // Bookings drive the CON RESERVA group; skipped entirely for a gym with no schedule.
    reservas = await getReservasDelDia(agenda.sesiones.map((s) => s.id));
    // Resolved here, not in a state initializer: "the class nearest NOW" must be the
    // same value in the SSR and hydration renders or React reports a mismatch.
    ctxInicial = sesionCercana(agenda.sesiones, new Date());
  } catch (err) {
    console.error("[asistencia] schedule read failed — falling back to ACCESO LIBRE", err);
  }

  return (
    <AsistenciaScreen
      clientes={clientes}
      marcadas={marcadas}
      hoyIso={hoyIso}
      sesiones={sesiones}
      reservas={reservas}
      ctxInicial={ctxInicial}
    />
  );
}
