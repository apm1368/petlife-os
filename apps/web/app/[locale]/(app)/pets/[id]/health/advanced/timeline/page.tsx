import { HealthTimelineView } from "@/features/health-advanced/HealthTimelineView";

export default async function HealthTimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <HealthTimelineView petId={id} />;
}
