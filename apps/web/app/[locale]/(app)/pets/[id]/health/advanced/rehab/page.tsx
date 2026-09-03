import { HealthRehabView } from "@/features/health-advanced/HealthRehabView";

export default async function HealthRehabPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <HealthRehabView petId={id} />;
}
