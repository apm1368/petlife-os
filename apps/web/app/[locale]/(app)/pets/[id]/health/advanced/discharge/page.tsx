import { HealthDischargeSummariesView } from "@/features/health-advanced/HealthDischargeSummariesView";

export default async function PetDischargeSummariesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <HealthDischargeSummariesView petId={id} />;
}
