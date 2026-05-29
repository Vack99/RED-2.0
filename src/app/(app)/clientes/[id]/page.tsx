import { ClienteDetalle } from "@/components/forge/screens/cliente-detalle";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ClienteDetalle id={Number(id)} />;
}
