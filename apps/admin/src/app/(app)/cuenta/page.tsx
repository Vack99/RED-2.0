import { listAboutValues } from "@gym/data/server/about-values";
import { getClassTypes } from "@gym/data/server/class-type";
import { getCoaches } from "@gym/data/server/coach";
import { getCobro } from "@gym/data/server/cobro";
import { listFacilities } from "@gym/data/server/facilities";
import { listFaqs } from "@gym/data/server/faqs";
import { getClientHost, getOperatorGym } from "@gym/data/server/gym";
import { getIdentidadLegal } from "@gym/data/server/legal";
import { getContacto } from "@gym/data/server/marketing";
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
  // `brandName` here is the per-GYM legal name (gym.brand_name — packages/domain/src/legal.ts's
  // own doc comment names it `nombreComercial`'s real source), NOT `brand.copy.name` below (a
  // per-BRAND-MODULE literal shared by every gym on that module — review finding 1: passing the
  // latter into a legal document naming the responsable rendered the same commercial name for
  // every gym sharing a brand).
  const { id: gymId, timezone: tz, brandName: gymBrandName } = await getOperatorGym();
  const [
    perfil,
    resumen,
    cobro,
    paquetes,
    plantillas,
    coaches,
    classTypes,
    brand,
    aboutValues,
    facilities,
    stats,
    faqs,
    mensajes,
    mesesRespaldo,
    identidadLegal,
    contacto,
    clientHost,
  ] = await Promise.all([
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
    getIdentidadLegal(),
    // #256: the aviso's real telefono/email source (gym_contact, already public) and its own
    // stable public URL (the gym's mapped CLIENT host, a different host than this admin page).
    getContacto(gymId),
    getClientHost(gymId),
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
      gymBrandName={gymBrandName}
      aboutValues={aboutValues}
      facilities={facilities}
      stats={stats}
      faqs={faqs}
      mensajes={mensajes}
      mesesRespaldo={mesesRespaldo}
      identidadLegal={identidadLegal}
      telefonoContactoAviso={contacto?.whatsapp ? `+${contacto.whatsapp}` : null}
      emailContactoAviso={contacto?.email ?? null}
      urlAvisoIntegral={clientHost ? `https://${clientHost}/legal` : null}
    />
  );
}
