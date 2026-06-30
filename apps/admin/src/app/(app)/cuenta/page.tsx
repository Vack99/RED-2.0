import { getCobro } from "@gym/data/server/cobro";
import { getPaquetes } from "@gym/data/server/paquetes";
import { getPerfil } from "@gym/data/server/perfil";
import { listarPlantillas } from "@gym/data/server/plantillas";
import { getResumenMes } from "@gym/data/server/resumen";
import { fmtMesAnio, hoyChihuahua } from "@gym/format";

import { CuentaScreen } from "./_components/cuenta";

export default async function Page() {
  const [perfil, resumen, cobro, paquetes, plantillas] = await Promise.all([
    getPerfil(),
    getResumenMes(),
    getCobro(),
    getPaquetes(),
    listarPlantillas(),
  ]);

  const mesLabel = fmtMesAnio(hoyChihuahua());

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
