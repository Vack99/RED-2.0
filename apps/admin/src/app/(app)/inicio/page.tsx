import type { Route } from "next";

import { getRosterResumen } from "@gym/data/server/clientes";
import { getOperatorGym } from "@gym/data/server/gym";
import { modo } from "@gym/domain/rules";
import { fmtDiaInicio, hoyEnZona, toIsoDay } from "@gym/format";

import { InicioScreen } from "./_components/inicio";
import { derivarDia } from "./_components/inicio-vm";
import { leerDia } from "./reads";

/**
 * /inicio (#328, spec #326) — the home rebuild on main's current skin. The day-card's
 * schedule read is issued ONLY on Cupo (`leerDia`, ../reads.ts — Lista never touches
 * the client at all, `data-seam.test.ts`). Every clock read lives HERE, on the
 * server, against the gym's tz — never the browser clock, and never in the client
 * render (InicioScreen is a plain server component; SSR and hydration are identical
 * by construction).
 */
export default async function Page() {
  const gym = await getOperatorGym();
  const gymModo = modo(gym.bookingEnabled);
  const hoyLocal = hoyEnZona(gym.timezone);
  const hoyIso = toIsoDay(hoyLocal);

  const [roster, lectura] = await Promise.all([getRosterResumen(), leerDia(gymModo, hoyIso)]);

  const ahora = new Date();
  const sesiones = lectura.agenda?.sesiones ?? [];
  const dia = derivarDia(sesiones, lectura.visitas, gym.timezone, ahora);

  // "Apartar lugar" lands on the NEXT upcoming class's own quick-glance sheet, open
  // on arrival (`/agenda?sesion=<id>`, resolved+opened by the Agenda screen itself,
  // #328) — the roster there is where a walk-in gets ADDED. With nothing left today
  // it falls back to the plain agenda. Unused on Lista, which never renders the link.
  const proxima = sesiones.find((s) => s.startsAt.getTime() > ahora.getTime());

  return (
    <InicioScreen
      modo={gymModo}
      fecha={fmtDiaInicio(hoyLocal)}
      gymNombre={gym.brandName}
      inicialCuenta={gym.brandName.trim().charAt(0).toUpperCase()}
      dia={dia}
      apartarHref={(proxima ? `/agenda?sesion=${proxima.id}` : "/agenda") as Route}
      vigentes={roster.vigentes}
      total={roster.total}
      nuevosOnline={roster.nuevosOnline}
      porRenovar={roster.porRenovar}
      aunATiempo={roster.aunATiempo}
    />
  );
}
