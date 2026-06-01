import { getAsistenciasHoy } from "@/lib/data/asistencia";
import { getRosterResumen } from "@/lib/data/clientes";
import { getResumenMes } from "@/lib/data/resumen";
import { fmtEyebrow } from "@/lib/date";
import { hoyChihuahua } from "@/lib/fecha";

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
