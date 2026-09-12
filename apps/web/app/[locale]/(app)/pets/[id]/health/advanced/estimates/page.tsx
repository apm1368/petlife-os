import { HealthEstimatesView } from "@/features/health-advanced/HealthEstimatesView";

export default async function PetEstimatesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <HealthEstimatesView petId={id} />;
}
