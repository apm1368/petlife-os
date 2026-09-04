import { PetInsuranceView } from "@/features/insurance/PetInsuranceView";

export default async function PetInsurancePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <PetInsuranceView petId={id} />;
}
