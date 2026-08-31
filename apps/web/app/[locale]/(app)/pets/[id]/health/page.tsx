import { HealthOverviewView } from "@/features/health/HealthOverviewView";

export default async function HealthOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <HealthOverviewView petId={id} />;
}
