import { getClientesLite } from "@gym/data/server/clientes";
import { getOperatorGym } from "@gym/data/server/gym";
import { getPaquetes } from "@gym/data/server/paquetes";
import { hoyEnZona, toIsoDay } from "@gym/format";

import { resolveBrand } from "../../../lib/brand";
import { VenderScreen } from "./_components/vender";

export default async function Page({
  searchParams,
}: {
  // Next 15: searchParams is async. The ficha/roster COBRAR deep-links land here
  // as `/vender?cliente=<id>` to preselect an EXISTENTE sale (#77).
  searchParams: Promise<{ cliente?: string }>;
}) {
  const [{ cliente }, paquetes, clientes, brand, gym] = await Promise.all([
    searchParams,
    getPaquetes(),
    getClientesLite(),
    resolveBrand(),
    getOperatorGym(),
  ]);
  // The receipt lockup is the resolved marca's logo (grill lock (g)), rendered
  // server-side and slotted into the client receipt. `glow={false}`: the receipt is a
  // fixed cream card in both themes, and a neon halo prints there as a pink smudge.
  const Lockup = brand.logo;
  return (
    <VenderScreen
      paquetes={paquetes}
      clientes={clientes}
      initialClienteId={cliente ?? null}
      // The GYM's calendar day, not the browser's. A PERSONALIZADO package's expiry
      // is only known once the operator types `dias`, so the client derives the
      // "Hasta …" hint — and it must anchor on the gym's timezone (ADR-0003), the
      // same way PaqueteDTO.hasta is precomputed here for registered plans.
      hoyGym={toIsoDay(hoyEnZona(gym.timezone))}
      lockup={<Lockup size={11} glow={false} />}
    />
  );
}
