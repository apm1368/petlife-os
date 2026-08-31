import { PetProfileView } from "@/features/pets/PetProfileView";

export default async function PetProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PetProfileView petId={id} />;
}
