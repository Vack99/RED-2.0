import { getPerfil } from "@/lib/data/perfil";

import { CuentaScreen } from "./_components/cuenta";

export default async function Page() {
  const perfil = await getPerfil();
  return <CuentaScreen perfil={perfil} />;
}
