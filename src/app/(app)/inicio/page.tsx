import { getAsistenciasHoy } from "@/lib/data/asistencia";
import { getClientesRoster } from "@/lib/data/clientes";
import { getResumenMes } from "@/lib/data/resumen";
import { hoyChihuahua } from "@/lib/fecha";

import { InicioScreen } from "./_components/inicio";

export default async function Page() {
  const [resumen, clientes, recientes] = await Promise.all([
    getResumenMes(),
    getClientesRoster(),
    getAsistenciasHoy(),
  ]);

  // Vigentes = clients with a still-valid active package (estado derived at read,
  // ADR-0002 — never recompute thresholds here). Denominator excludes sin_clases.
  const vigentes = clientes.filter((c) => c.estado === "activo").length;
  const totalActivos = clientes.filter((c) => c.estado !== "sin_clases").length;
  const hoy = hoyChihuahua();

  return (
    <InicioScreen
      resumen={resumen}
      vigentes={vigentes}
      totalActivos={totalActivos}
      recientes={recientes}
      hoy={{ dow: hoy.getDay(), date: hoy.getDate(), month: hoy.getMonth() }}
    />
  );
}
