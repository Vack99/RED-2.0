import { listAboutValues } from "@gym/data/server/about-values";
import { getClassTypes } from "@gym/data/server/class-type";
import { getCoaches } from "@gym/data/server/coach";
import { getCobro } from "@gym/data/server/cobro";
import { listFacilities } from "@gym/data/server/facilities";
import { listFaqs } from "@gym/data/server/faqs";
import { getOperatorGym } from "@gym/data/server/gym";
import { listMensajes } from "@gym/data/server/mensajes";
import { getPlanesEditor } from "@gym/data/server/paquetes";
import { getPerfil } from "@gym/data/server/perfil";
import { listarPlantillas } from "@gym/data/server/plantillas";
import { getMesesRespaldo } from "@gym/data/server/respaldo";
import { getResumenMes } from "@gym/data/server/resumen";
import { listStats } from "@gym/data/server/stats";
import { fmtMesAnio, hoyEnZona } from "@gym/format";

import { resolveBrand } from "../../../lib/brand";
import { CuentaScreen } from "./_components/cuenta";

export default async function Page() {
  const { timezone: tz } = await getOperatorGym();
  const [perfil, resumen, cobro, paquetes, plantillas, coaches, classTypes, brand, aboutValues, facilities, stats, faqs, mensajes, mesesRespaldo] =
    await Promise.all([
      getPerfil(),
      getResumenMes(),
      getCobro(),
      getPlanesEditor(undefined, tz),
      listarPlantillas(),
      getCoaches(),
      getClassTypes(),
      resolveBrand(),
      listAboutValues(),
      listFacilities(),
      listStats(),
      listFaqs(),
      listMensajes(),
      getMesesRespaldo(),
    ]);

  const mesLabel = fmtMesAnio(hoyEnZona(tz));

  return (
    <CuentaScreen
      perfil={perfil}
      resumen={resumen}
      cobro={cobro}
      paquetes={paquetes}
      plantillas={plantillas}
      coaches={coaches}
      classTypes={classTypes}
      mesLabel={mesLabel}
      brandName={brand.copy.name}
      aboutValues={aboutValues}
      facilities={facilities}
      stats={stats}
      faqs={faqs}
      mensajes={mensajes}
      mesesRespaldo={mesesRespaldo}
    />
  );
}
