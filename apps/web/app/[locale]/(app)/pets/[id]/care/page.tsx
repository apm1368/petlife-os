import { CareProfileView } from "@/features/care/CareProfileView";

export default async function CareProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CareProfileView petId={id} />;
}
