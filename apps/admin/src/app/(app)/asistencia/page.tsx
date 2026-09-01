import { getAgendaDia, type AgendaDiaDTO, type SesionAgendaDTO } from "@gym/data/server/agenda";
import { getMarcadas, getReservasDelDia, type ReservaDelDia } from "@gym/data/server/asistencia";
import { getClientesParaPase } from "@gym/data/server/clientes";
import { getOperatorGym } from "@gym/data/server/gym";
import { hoyIsoEnZona, horaEnZona } from "@gym/format";
import { topTag } from "@gym/ui/forge/agenda/session-card";

import { AsistenciaScreen, type SesionDelDia } from "./_components/asistencia";
import { LIBRE, reservaAtribuible, sesionCercana } from "./_components/marcadas";

/**
 * The desk names a class exactly as the Agenda does: an evento especial reads by its own
 * name (an unnamed one reads "Especial"), everything else by its class type. Reuses the
 * Agenda card's own `topTag` — `isNext: false` because the pill has no "A continuación"
 * slot for the especial name to lose to, which is the only thing `muestraEspecial` decides.
 */
function etiquetaSesion(s: SesionAgendaDTO): string {
  return topTag({ isNext: false, isSpecial: s.esEspecial, specialName: s.nombreEspecial }) ?? s.tipo;
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ sesion?: string }>;
}) {
  const { timezone: tz } = await getOperatorGym();
  const hoyIso = hoyIsoEnZona(tz);
  // `?sesion=` (#328) — /inicio's Cupo day-card hero deep-links the desk here with a
  // session already chosen, skipping the ±90 preselect it would otherwise run. Only
  // trusted once the id is confirmed to belong to TODAY's own agenda read below (an
  // id from a stale link, a different day, or a gym with no schedule falls back to
  // the ordinary `sesionCercana` ladder — never a raw, unchecked query param).
  const sesionParam = (await searchParams).sesion;

  // getAgendaDia depends ONLY on hoyIso (resolved above), never on clientes/marcadas — so it
  // rides in the SAME round trip as that pair, not after it (perf #242): the previous
  // `await getAgendaDia(...)` AFTER the clientes/marcadas Promise.all was an accidental
  // sequencing, not a real dependency, and it's the expensive materialize-then-fetch leg
  // (ADR-0010). Its own failure is caught HERE, inside the leg, rather than left to reject
  // the whole Promise.all — a failing schedule read must never cost the roster/marcadas that
  // already succeeded.
  const [clientes, marcadas, agenda] = await Promise.all([
    getClientesParaPase(),
    getMarcadas(),
    getAgendaDia(hoyIso).catch((err): AgendaDiaDTO | null => {
      console.error("[asistencia] schedule read failed — falling back to ACCESO LIBRE", err);
      return null;
    }),
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
  if (agenda) {
    sesiones = agenda.sesiones.map((s) => ({
      id: s.id,
      hora: horaEnZona(s.startsAt, tz),
      tipo: etiquetaSesion(s),
      capacidad: s.capacidad,
    }));
    try {
      // Bookings drive the CON RESERVA group; skipped entirely for a gym with no schedule.
      reservas = await getReservasDelDia(agenda.sesiones.map((s) => s.id));
      // Both of these are resolved here, not in a state initializer: each measures a
      // distance from an absolute NOW, which must be the same value in the SSR and hydration
      // renders or React reports a mismatch. That is also why the session instants stay on
      // the server — the screen receives only ids and gym-local hora labels.
      const ahora = new Date();
      const preseleccion =
        typeof sesionParam === "string" && agenda.sesiones.some((s) => s.id === sesionParam)
          ? sesionParam
          : null;
      ctxInicial = preseleccion ?? sesionCercana(agenda.sesiones, ahora);
      reservaAtribuiblePorCliente = reservaAtribuible(agenda.sesiones, reservas, ahora);
    } catch (err) {
      console.error(
        "[asistencia] reservas read failed — sesiones still render, CON RESERVA grouping lost",
        err,
      );
    }
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
    />
  );
}
