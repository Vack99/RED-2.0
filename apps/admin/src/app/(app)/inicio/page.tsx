import { getAsistenciasHoy } from "@gym/data/server/asistencia";
import { getRosterResumen } from "@gym/data/server/clientes";
import { getResumenMes } from "@gym/data/server/resumen";
import { fmtEyebrow, hoyChihuahua } from "@gym/format";

import { resolveBrand } from "../../../lib/brand";
import { InicioScreen } from "./_components/inicio";

export default async function Page() {
  const [resumen, roster, recientes, brand] = await Promise.all([
    getResumenMes(),
    getRosterResumen(),
    getAsistenciasHoy(),
    resolveBrand(),
  ]);

  const eyebrow = fmtEyebrow(hoyChihuahua());
  // The home lockup is the resolved marca's logo (grill lock (g)) — rendered
  // server-side so the client screen just slots the element (a server logo type
  // can't cross into a client component).
  const Lockup = brand.logo;

  return (
    <InicioScreen
      resumen={resumen}
      vigentes={roster.vigentes}
      totalActivos={roster.totalActivos}
      recientes={recientes}
      eyebrow={eyebrow}
      lockup={<Lockup size={12} />}
    />
  );
}
