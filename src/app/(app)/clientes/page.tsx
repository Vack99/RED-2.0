import { getClientesRoster } from "@gym/data/server/clientes";

import { ClientesScreen } from "./_components/clientes";

export default async function Page() {
  const clientes = await getClientesRoster();
  return <ClientesScreen clientes={clientes} />;
}
