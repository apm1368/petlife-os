import { HealthLabsView } from "@/features/health-advanced/HealthLabsView";

export default async function HealthLabsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <HealthLabsView petId={id} />;
}
