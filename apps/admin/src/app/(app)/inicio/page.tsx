import { getRosterResumen } from "@gym/data/server/clientes";
import { getOperatorGym } from "@gym/data/server/gym";
import { modo } from "@gym/domain/rules";
import { hoyEnZona, parseDay, toIsoDay } from "@gym/format";

import { InicioScreen } from "./_components/inicio";
import { derivarDia, derivarDiaSiguiente, derivarFechaHeader } from "./_components/inicio-vm";
import { leerDia, leerProximoDia, leerResumenAsistencias } from "./reads";

/**
 * /inicio (#328, spec #326) — the home rebuild on main's current skin. The day-card's
 * schedule read is issued ONLY on Cupo (`leerDia`, ../reads.ts — Lista never touches
 * the client at all, `data-seam.test.ts`), mirrored by the ASISTENCIAS · HOY hero's
 * attendance-count read (`leerResumenAsistencias`), issued ONLY on Lista (owner ruling
 * 2026-09-01). Every clock read lives HERE, on the server, against the gym's tz — never
 * the browser clock, and never in the client render (InicioScreen is a plain server
 * component; SSR and hydration are identical by construction).
 *
 * Cupo's hero rolls to the next day (owner ruling 2026-09-01): once TODAY's own agenda
 * comes back with no hero (`derivarDia` → `null`) but the read itself succeeded —
 * never on a failed read, and never on Lista, whose `agenda` is always `null` by
 * construction (`leerDia`) — `leerProximoDia` looks ahead for the first later day with
 * a class, and `derivarDiaSiguiente` builds the day card from it. The standalone PASE
 * DE LISTA arm (`dia === null`) survives only once that ALSO comes up empty.
 */
export default async function Page() {
  const gym = await getOperatorGym();
  const gymModo = modo(gym.bookingEnabled);
  const hoyLocal = hoyEnZona(gym.timezone);
  const hoyIso = toIsoDay(hoyLocal);

  const [roster, lectura, asistenciasResumen] = await Promise.all([
    getRosterResumen(),
    leerDia(gymModo, hoyIso),
    leerResumenAsistencias(gymModo),
  ]);

  const ahora = new Date();
  const sesiones = lectura.agenda?.sesiones ?? [];
  let dia = derivarDia(sesiones, lectura.visitas, gym.timezone, ahora);

  // Today's own read succeeded (agenda !== null) but left no hero: look ahead,
  // bounded, before giving up to the standalone CTA. A failed read (agenda === null
  // on Cupo) or Lista (agenda === null by construction) skip this — there is nothing
  // to roll forward FROM.
  if (dia === null && lectura.agenda !== null) {
    const proximo = await leerProximoDia(hoyIso);
    if (proximo) {
      dia = derivarDiaSiguiente(proximo.sesiones, gym.timezone, parseDay(proximo.fecha), hoyLocal);
    }
  }

  const fechaHeader = derivarFechaHeader(hoyLocal);

  return (
    <InicioScreen
      modo={gymModo}
      diaSemana={fechaHeader.diaSemana}
      mesAnio={fechaHeader.mesAnio}
      gymNombre={gym.brandName}
      inicialCuenta={gym.brandName.trim().charAt(0).toUpperCase()}
      dia={dia}
      vigentes={roster.vigentes}
      total={roster.total}
      nuevosOnline={roster.nuevosOnline}
      porRenovar={roster.porRenovar}
      aunATiempo={roster.aunATiempo}
      asistenciasResumen={asistenciasResumen}
    />
  );
}
