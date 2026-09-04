import { MemoriesListView } from "@/features/memories/MemoriesListView";

export default async function MemoriesListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MemoriesListView petId={id} />;
}
