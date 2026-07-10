import { getClientesLite } from "@gym/data/server/clientes";
import { getPaquetes } from "@gym/data/server/paquetes";

import { resolveBrand } from "../../../lib/brand";
import { VenderScreen } from "./_components/vender";

export default async function Page({
  searchParams,
}: {
  // Next 15: searchParams is async. The ficha/roster COBRAR deep-links land here
  // as `/vender?cliente=<id>` to preselect an EXISTENTE sale (#77).
  searchParams: Promise<{ cliente?: string }>;
}) {
  const [{ cliente }, paquetes, clientes, brand] = await Promise.all([
    searchParams,
    getPaquetes(),
    getClientesLite(),
    resolveBrand(),
  ]);
  // The receipt lockup is the resolved marca's logo (grill lock (g)), rendered
  // server-side and slotted into the client receipt.
  const Lockup = brand.logo;
  return (
    <VenderScreen
      paquetes={paquetes}
      clientes={clientes}
      initialClienteId={cliente ?? null}
      lockup={<Lockup size={11} />}
    />
  );
}
