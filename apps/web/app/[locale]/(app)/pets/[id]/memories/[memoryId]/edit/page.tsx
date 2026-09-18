import { EditMemoryView } from "@/features/memories/EditMemoryView";

export default async function EditMemoryPage({ params }: { params: Promise<{ id: string; memoryId: string }> }) {
  const { id, memoryId } = await params;
  return <EditMemoryView petId={id} memoryId={memoryId} />;
}
