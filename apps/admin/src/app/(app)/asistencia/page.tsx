import { getAgendaDia, type AgendaDiaDTO, type SesionAgendaDTO } from "@gym/data/server/agenda";
import { getMarcadas, getReservasDelDia, type ReservaDelDia } from "@gym/data/server/asistencia";
import { getClientesParaPase } from "@gym/data/server/clientes";
import { getOperatorGym } from "@gym/data/server/gym";
import { modo } from "@gym/domain/rules";
import { hoyIsoEnZona, horaEnZona } from "@gym/format";
import { nombreSesion } from "@gym/ui/forge/agenda/session-card";

import { AsistenciaScreen, type SesionDelDia } from "./_components/asistencia";
import { ctxDesdeSesionParam } from "./_components/entrada";
import { LIBRE, reservaAtribuible } from "./_components/marcadas";

/**
 * The desk names a class exactly as the Agenda does: an evento especial reads by its own
 * name (an unnamed one reads "Especial"), everything else by its class type. Reuses the
 * Agenda card's own lifted `nombreSesion` (#328 prefactor) instead of re-deriving it.
 */
function etiquetaSesion(s: SesionAgendaDTO): string {
  return nombreSesion(s.tipo, { isSpecial: s.esEspecial, specialName: s.nombreEspecial });
}

export default async function Page({
  searchParams,
}: {
  // ?sesion=<id> — the home hero's PASAR LISTA or a peek row (#328) — skips the Cupo
  // entry step (#330) and lands the desk directly on that class's roster. Lista never
  // sends it: it has no classes to link to (#329).
  searchParams: Promise<{ sesion?: string }>;
}) {
  const [{ sesion: sesionParam }, { timezone: tz, bookingEnabled }] = await Promise.all([
    searchParams,
    getOperatorGym(),
  ]);
  const hoyIso = hoyIsoEnZona(tz);
  // The mode, derived ONCE for this screen (#327) from the gym's own flag — never
  // re-derived per branch below. It decides two things and only two: whether the day's
  // schedule is read at all (Lista never reads it, #329) and whether the entry step has
  // to ask before the roster shows names (Cupo only, #330).
  const esCupo = modo(bookingEnabled) === "cupo";

  // getAgendaDia depends ONLY on hoyIso (resolved above), never on clientes/marcadas — so it
  // rides in the SAME round trip as that pair, not after it (perf #242): the previous
  // `await getAgendaDia(...)` AFTER the clientes/marcadas Promise.all was an accidental
  // sequencing, not a real dependency, and it's the expensive materialize-then-fetch leg
  // (ADR-0010). Its own failure is caught HERE, inside the leg, rather than left to reject
  // the whole Promise.all — a failing schedule read must never cost the roster/marcadas that
  // already succeeded.
  //
  // On Lista the read is never ISSUED at all (spec #326/#329), not merely discarded: the
  // desk is the notebook, so there is no schedule to ask for. `Promise.resolve(null)` takes
  // the same branch below (`if (agenda)` stays false) that a failed Cupo read already takes,
  // which is how a gym with no maintained schedule has always rendered — ACCESO LIBRE, full
  // roster, no pills.
  const [clientes, marcadas, agenda] = await Promise.all([
    getClientesParaPase(),
    getMarcadas(),
    esCupo
      ? getAgendaDia(hoyIso).catch((err): AgendaDiaDTO | null => {
          console.error("[asistencia] schedule read failed — falling back to ACCESO LIBRE", err);
          return null;
        })
      : Promise.resolve(null),
  ]);

  // The schedule is an ENHANCEMENT of the desk, never its precondition: a gym with no
  // maintained schedule (or a failed read, above) renders ACCESO LIBRE + the full roster by
  // design, so a failing agenda read degrades to exactly THAT instead of 500-ing the door
  // screen — the one screen that must open when someone is standing at it. (There is no
  // error.tsx in this app; the degradation is here, in the read.) Bookings are a SECOND,
  // independent read (getReservasDelDia) that can fail on its own without losing the
  // sesiones pills already resolved above — only the CON RESERVA grouping goes.
  let sesiones: SesionDelDia[] = [];
  let reservas: Record<string, ReservaDelDia[]> = {};
  let reservaAtribuiblePorCliente: Record<string, string> = {};
  let ctxInicial: string = LIBRE;
  // Cupo only (#330): whether the desk must ask before the roster shows names. Lista's
  // ACCESO LIBRE notebook (#329) never asks — it never even reads the schedule — so this
  // stays false for that mode by construction, not by a second mode check.
  let entradaPendiente = false;
  if (agenda) {
    // Reached on Cupo ONLY: Lista resolved `agenda` to null above without a read.
    sesiones = agenda.sesiones.map((s) => ({
      id: s.id,
      hora: horaEnZona(s.startsAt, tz),
      tipo: etiquetaSesion(s),
      capacidad: s.capacidad,
    }));
    // The ±90-minute guess is no longer how Cupo picks a class: a valid `?sesion=` (the
    // home hero / a peek row, #328) names it — validated against TODAY's own agenda read,
    // never trusted raw — and anything else means the entry step must ask (entrada.ts's
    // opcionesEntrada renders the list it asks with). Decided BEFORE the reservas read,
    // which can fail on its own: a class list is enough to pick or to ask.
    const ctxParam = ctxDesdeSesionParam(sesionParam, sesiones);
    if (ctxParam) ctxInicial = ctxParam;
    else entradaPendiente = true;
    try {
      // Bookings drive the CON RESERVA group; skipped entirely for a gym with no schedule.
      reservas = await getReservasDelDia(agenda.sesiones.map((s) => s.id));
      // Resolved here, not in a state initializer: it measures a distance from an absolute
      // NOW, which must be the same value in the SSR and hydration renders or React reports
      // a mismatch. That is also why the session instants stay on the server — the screen
      // receives only ids and gym-local hora labels.
      const ahora = new Date();
      reservaAtribuiblePorCliente = reservaAtribuible(agenda.sesiones, reservas, ahora);
    } catch (err) {
      console.error(
        "[asistencia] reservas read failed — sesiones still render, CON RESERVA grouping lost",
        err,
      );
    }
  } else if (esCupo) {
    // Cupo with no maintained schedule, or the agenda read itself failed — the entry step
    // still asks, offering only ACCESO LIBRE (opcionesEntrada with an empty session list).
    entradaPendiente = true;
  }

  return (
    <AsistenciaScreen
      clientes={clientes}
      marcadas={marcadas}
      hoyIso={hoyIso}
      sesiones={sesiones}
      reservas={reservas}
      reservaAtribuible={reservaAtribuiblePorCliente}
      ctxInicial={ctxInicial}
      entradaPendiente={entradaPendiente}
    />
  );
}
