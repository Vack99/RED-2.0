import { getClientesRoster } from "@gym/data/server/clientes";

import { ClientesScreen } from "./_components/clientes";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ online?: string; renovar?: string }>;
}) {
  const [clientes, sp] = await Promise.all([getClientesRoster(), searchParams]);
  return (
    <ClientesScreen
      clientes={clientes}
      initialOnline={sp.online === "1"}
      // INICIO's POR RENOVAR tile (#228, next slice) deep-links here — the
      // param name mirrors the existing `online` one and the filter's own
      // state variable (`renovar`).
      initialRenovar={sp.renovar === "1"}
    />
  );
}
