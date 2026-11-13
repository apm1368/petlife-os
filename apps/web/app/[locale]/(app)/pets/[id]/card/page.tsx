import { PetCardManagerView } from "@/features/pet-safety/PetCardManagerView";

export default async function PetCardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PetCardManagerView petId={id} />;
}
