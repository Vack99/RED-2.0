import { getClientesRoster } from "@gym/data/server/clientes";

import { ClientesScreen } from "./_components/clientes";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ online?: string; renovar?: string; atiempo?: string }>;
}) {
  const [clientes, sp] = await Promise.all([getClientesRoster(), searchParams]);
  return (
    <ClientesScreen
      clientes={clientes}
      initialOnline={sp.online === "1"}
      // INICIO's POR RENOVAR tile (#228) deep-links here — the param name
      // mirrors the existing `online` one and the filter's own state variable
      // (`renovar`).
      initialRenovar={sp.renovar === "1"}
      // INICIO's AÚN A TIEMPO tile (#229) — same mechanism. `atiempo` (opus
      // review nit), lowercase like every other param (online/renovar/cliente).
      initialAunATiempo={sp.atiempo === "1"}
    />
  );
}
