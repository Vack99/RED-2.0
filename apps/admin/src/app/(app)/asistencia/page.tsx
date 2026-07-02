import { getMarcadas } from "@gym/data/server/asistencia";
import { getClientesParaPase } from "@gym/data/server/clientes";
import { getOperatorGym } from "@gym/data/server/gym";
import { hoyIsoEnZona } from "@gym/format";

import { AsistenciaScreen } from "./_components/asistencia";

export default async function Page() {
  const { timezone: tz } = await getOperatorGym();
  const [clientes, marcadas] = await Promise.all([getClientesParaPase(), getMarcadas()]);
  return <AsistenciaScreen clientes={clientes} marcadas={marcadas} hoyIso={hoyIsoEnZona(tz)} />;
}
