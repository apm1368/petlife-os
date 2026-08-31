import { MedicationsView } from "@/features/health/MedicationsView";

export default async function MedicationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <MedicationsView petId={id} />;
}
