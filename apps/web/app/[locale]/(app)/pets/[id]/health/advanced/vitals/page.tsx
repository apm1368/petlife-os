import { HealthVitalsView } from "@/features/health-advanced/HealthVitalsView";

export default async function PetVitalsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <HealthVitalsView petId={id} />;
}
