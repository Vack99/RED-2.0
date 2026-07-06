import { getCobro } from "@gym/data/server/cobro";
import { getOperatorGym } from "@gym/data/server/gym";
import { getPlanesEditor } from "@gym/data/server/paquetes";
import { getPerfil } from "@gym/data/server/perfil";
import { listarPlantillas } from "@gym/data/server/plantillas";
import { getResumenMes } from "@gym/data/server/resumen";
import { fmtMesAnio, hoyEnZona } from "@gym/format";

import { resolveBrand } from "../../../lib/brand";
import { CuentaScreen } from "./_components/cuenta";

export default async function Page() {
  const { timezone: tz } = await getOperatorGym();
  const [perfil, resumen, cobro, paquetes, plantillas, brand] = await Promise.all([
    getPerfil(),
    getResumenMes(),
    getCobro(),
    getPlanesEditor(undefined, tz),
    listarPlantillas(),
    resolveBrand(),
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
      brandName={brand.copy.name}
    />
  );
}
