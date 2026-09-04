import { PetPassportReadinessView } from "@/features/travel/PetPassportReadinessView";

export default async function PetPassportReadinessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PetPassportReadinessView petId={id} />;
}
