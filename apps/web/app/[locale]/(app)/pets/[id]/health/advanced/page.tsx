import { AdvancedHealthOverviewView } from "@/features/health-advanced/AdvancedHealthOverviewView";

export default async function AdvancedHealthOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdvancedHealthOverviewView petId={id} />;
}
