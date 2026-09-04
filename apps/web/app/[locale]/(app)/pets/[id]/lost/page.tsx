import { LostPetIncidentListView } from "@/features/lost-pet/LostPetIncidentListView";

export default async function LostPetIncidentListPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LostPetIncidentListView petId={id} />;
}
