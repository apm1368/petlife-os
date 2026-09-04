import { CreateMemoryView } from "@/features/memories/CreateMemoryView";

export default async function CreateMemoryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <CreateMemoryView petId={id} />;
}
