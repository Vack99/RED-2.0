import { getMarcadas } from "@/lib/data/asistencia";
import { getClientesParaPase } from "@/lib/data/clientes";
import { hoyIsoChihuahua } from "@/lib/fecha";

import { AsistenciaScreen } from "./_components/asistencia";

export default async function Page() {
  const [clientes, marcadas] = await Promise.all([getClientesParaPase(), getMarcadas()]);
  return <AsistenciaScreen clientes={clientes} marcadas={marcadas} hoyIso={hoyIsoChihuahua()} />;
}
