import { notFound } from "next/navigation";

import { getClienteFicha } from "@gym/data/server/clientes";

import { ClienteDetalle } from "./_components/cliente-detalle";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const ficha = await getClienteFicha(id);
  if (!ficha) notFound();
  return <ClienteDetalle ficha={ficha} />;
}
