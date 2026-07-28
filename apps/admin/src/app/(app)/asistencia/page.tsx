import { getMarcadas } from "@gym/data/server/asistencia";
import { getClientesParaPase } from "@gym/data/server/clientes";
import { getOperatorGym } from "@gym/data/server/gym";
import { hoyIsoEnZona } from "@gym/format";

import { AsistenciaScreen } from "./_components/asistencia";
import { PrototypeSwitcher } from "./_components/prototype/switcher";
import { VariantAChips } from "./_components/prototype/variant-a-chips";
import { VariantBFeed } from "./_components/prototype/variant-b-feed";
import { VariantCClases } from "./_components/prototype/variant-c-clases";
import { VariantDPuerta } from "./_components/prototype/variant-d-puerta";
import { getReservasDelDiaProto, getSesionesDelDiaProto } from "./prototype-sesiones";

/* PROTOTYPE (#89): `?variant=A|B|C|D` swaps the rendering only. With no param this
   route is byte-identical to production. Variant D won (see
   _components/prototype/NOTES.md); delete _components/prototype/ and
   prototype-sesiones.ts when D is folded into the real screen.

   The client files live under _components/ because the client→server seam guard
   (tools/guards/client-seam.test.ts) requires it; the server reader stays out of
   _components/ because the ESLint rule covering that folder forbids the value
   import of @gym/data/server that it needs. */
const VARIANTES = [
  { k: "A", name: "Chips de clase" },
  { k: "B", name: "Recepción (caras + feed)" },
  { k: "C", name: "Clases del día" },
  { k: "D", name: "Puerta (lista + selector fino)" },
];

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { timezone: tz } = await getOperatorGym();
  const hoyIso = hoyIsoEnZona(tz);
  const [clientes, marcadas] = await Promise.all([getClientesParaPase(), getMarcadas()]);

  const vParam = (await searchParams).variant;
  const variant = typeof vParam === "string" ? vParam.toUpperCase() : null;
  if (!variant || !VARIANTES.some((v) => v.k === variant)) {
    return <AsistenciaScreen clientes={clientes} marcadas={marcadas} hoyIso={hoyIso} />;
  }

  const sesiones = await getSesionesDelDiaProto(hoyIso);
  const reservas = await getReservasDelDiaProto(sesiones.map((s) => s.id));
  const marcadasHoy = marcadas.marcadasDelDia[hoyIso] ?? [];
  const props = { clientes, sesiones, marcadasHoy };

  return (
    <>
      {variant === "A" && <VariantAChips {...props} />}
      {variant === "B" && <VariantBFeed {...props} />}
      {variant === "C" && <VariantCClases {...props} />}
      {variant === "D" && <VariantDPuerta {...props} reservas={reservas} />}
      <PrototypeSwitcher variants={VARIANTES} current={variant} />
    </>
  );
}
