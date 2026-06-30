import { getAsistenciasHoy } from "@gym/data/server/asistencia";
import { getRosterResumen } from "@gym/data/server/clientes";
import { getResumenMes } from "@gym/data/server/resumen";
import { fmtEyebrow, hoyChihuahua } from "@gym/format";

import { InicioScreen } from "./_components/inicio";

export default async function Page() {
  const [resumen, roster, recientes] = await Promise.all([
    getResumenMes(),
    getRosterResumen(),
    getAsistenciasHoy(),
  ]);

  const eyebrow = fmtEyebrow(hoyChihuahua());

  return (
    <InicioScreen
      resumen={resumen}
      vigentes={roster.vigentes}
      totalActivos={roster.totalActivos}
      recientes={recientes}
      eyebrow={eyebrow}
    />
  );
}
