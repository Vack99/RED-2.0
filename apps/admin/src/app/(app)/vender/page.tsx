import { getClientesLite } from "@gym/data/server/clientes";
import { getPaquetes } from "@gym/data/server/paquetes";

import { resolveBrand } from "../../../lib/brand";
import { VenderScreen } from "./_components/vender";

export default async function Page() {
  const [paquetes, clientes, brand] = await Promise.all([
    getPaquetes(),
    getClientesLite(),
    resolveBrand(),
  ]);
  // The receipt lockup is the resolved marca's logo (grill lock (g)), rendered
  // server-side and slotted into the client receipt.
  const Lockup = brand.logo;
  return (
    <VenderScreen paquetes={paquetes} clientes={clientes} lockup={<Lockup size={11} />} />
  );
}
