import { LifeTimelineView } from "@/features/memories/LifeTimelineView";

export default async function LifeTimelinePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LifeTimelineView petId={id} />;
}
