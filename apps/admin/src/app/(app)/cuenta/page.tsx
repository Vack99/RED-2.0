import { getCobro } from "@gym/data/server/cobro";
import { getOperatorGym } from "@gym/data/server/gym";
import { getPaquetes } from "@gym/data/server/paquetes";
import { getPerfil } from "@gym/data/server/perfil";
import { listarPlantillas } from "@gym/data/server/plantillas";
import { getResumenMes } from "@gym/data/server/resumen";
import { fmtMesAnio, hoyEnZona } from "@gym/format";

import { CuentaScreen } from "./_components/cuenta";

export default async function Page() {
  const { timezone: tz } = await getOperatorGym();
  const [perfil, resumen, cobro, paquetes, plantillas] = await Promise.all([
    getPerfil(),
    getResumenMes(),
    getCobro(),
    getPaquetes(undefined, tz),
    listarPlantillas(),
  ]);

  const mesLabel = fmtMesAnio(hoyEnZona(tz));

  return (
    <CuentaScreen
      perfil={perfil}
      resumen={resumen}
      cobro={cobro}
      paquetes={paquetes}
      plantillas={plantillas}
      mesLabel={mesLabel}
    />
  );
}
