import { getCobro } from "@/lib/data/cobro";
import { getPaquetes } from "@/lib/data/paquetes";
import { getPerfil } from "@/lib/data/perfil";
import { getPlantillas } from "@/lib/data/plantillas";
import { getResumenMes } from "@/lib/data/resumen";
import { MONTHS_FULL } from "@/lib/date";
import { hoyChihuahua } from "@/lib/fecha";

import { CuentaScreen } from "./_components/cuenta";

export default async function Page() {
  const [perfil, resumen, cobro, paquetes, plantillas] = await Promise.all([
    getPerfil(),
    getResumenMes(),
    getCobro(),
    getPaquetes(),
    getPlantillas(),
  ]);

  const hoy = hoyChihuahua();
  const mesLabel = `${MONTHS_FULL[hoy.getMonth()]} ${hoy.getFullYear()}`.toUpperCase();
  const plantillasCount = Object.keys(plantillas).length;

  return (
    <CuentaScreen
      perfil={perfil}
      resumen={resumen}
      cobro={cobro}
      paquetes={paquetes}
      plantillasCount={plantillasCount}
      mesLabel={mesLabel}
    />
  );
}
