import { getCobro } from "@/lib/data/cobro";
import { getPaquetes } from "@/lib/data/paquetes";
import { getPerfil } from "@/lib/data/perfil";
import { listarPlantillas } from "@/lib/data/plantillas";
import { getResumenMes } from "@/lib/data/resumen";
import { fmtMesAnio } from "@/lib/date";
import { hoyChihuahua } from "@/lib/fecha";

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
