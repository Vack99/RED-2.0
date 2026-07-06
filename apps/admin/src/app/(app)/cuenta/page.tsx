import { listAboutValues } from "@gym/data/server/about-values";
import { getCobro } from "@gym/data/server/cobro";
import { listFacilities } from "@gym/data/server/facilities";
import { listFaqs } from "@gym/data/server/faqs";
import { getOperatorGym } from "@gym/data/server/gym";
import { getPaquetes } from "@gym/data/server/paquetes";
import { getPerfil } from "@gym/data/server/perfil";
import { listarPlantillas } from "@gym/data/server/plantillas";
import { getResumenMes } from "@gym/data/server/resumen";
import { listStats } from "@gym/data/server/stats";
import { fmtMesAnio, hoyEnZona } from "@gym/format";

import { resolveBrand } from "../../../lib/brand";
import { CuentaScreen } from "./_components/cuenta";

export default async function Page() {
  const { timezone: tz } = await getOperatorGym();
  const [perfil, resumen, cobro, paquetes, plantillas, brand, aboutValues, facilities, stats, faqs] =
    await Promise.all([
      getPerfil(),
      getResumenMes(),
      getCobro(),
      getPaquetes(undefined, tz),
      listarPlantillas(),
      resolveBrand(),
      listAboutValues(),
      listFacilities(),
      listStats(),
      listFaqs(),
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
      aboutValues={aboutValues}
      facilities={facilities}
      stats={stats}
      faqs={faqs}
    />
  );
}
