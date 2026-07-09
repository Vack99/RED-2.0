import { getClientesRoster } from "@gym/data/server/clientes";

import { ClientesScreen } from "./_components/clientes";

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ online?: string }>;
}) {
  const [clientes, sp] = await Promise.all([getClientesRoster(), searchParams]);
  return <ClientesScreen clientes={clientes} initialOnline={sp.online === "1"} />;
}
