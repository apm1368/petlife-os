import { HealthDentalView } from "@/features/health-advanced/HealthDentalView";

export default async function HealthDentalPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <HealthDentalView petId={id} />;
}
