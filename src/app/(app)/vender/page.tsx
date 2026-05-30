import { getClientesLite } from "@/lib/data/clientes";
import { getPaquetes } from "@/lib/data/paquetes";

import { VenderScreen } from "./_components/vender";

export default async function Page() {
  const [paquetes, clientes] = await Promise.all([getPaquetes(), getClientesLite()]);
  return <VenderScreen paquetes={paquetes} clientes={clientes} />;
}
