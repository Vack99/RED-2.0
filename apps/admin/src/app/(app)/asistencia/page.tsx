import { getMarcadas } from "@gym/data/server/asistencia";
import { getClientesParaPase } from "@gym/data/server/clientes";
import { hoyIsoChihuahua } from "@gym/format";

import { AsistenciaScreen } from "./_components/asistencia";

export default async function Page() {
  const [clientes, marcadas] = await Promise.all([getClientesParaPase(), getMarcadas()]);
  return <AsistenciaScreen clientes={clientes} marcadas={marcadas} hoyIso={hoyIsoChihuahua()} />;
}
