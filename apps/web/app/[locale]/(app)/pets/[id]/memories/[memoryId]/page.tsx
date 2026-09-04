import { MemoryDetailView } from "@/features/memories/MemoryDetailView";

export default async function MemoryDetailPage({ params }: { params: Promise<{ id: string; memoryId: string }> }) {
  const { id, memoryId } = await params;
  return <MemoryDetailView petId={id} memoryId={memoryId} />;
}
