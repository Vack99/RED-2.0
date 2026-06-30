import { getClientesLite } from "@gym/data/server/clientes";
import { getPaquetes } from "@gym/data/server/paquetes";

import { VenderScreen } from "./_components/vender";

export default async function Page() {
  const [paquetes, clientes] = await Promise.all([getPaquetes(), getClientesLite()]);
  return <VenderScreen paquetes={paquetes} clientes={clientes} />;
}
