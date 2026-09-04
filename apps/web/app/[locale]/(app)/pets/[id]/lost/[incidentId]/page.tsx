import { LostPetIncidentDetailView } from "@/features/lost-pet/LostPetIncidentDetailView";

export default async function LostPetIncidentDetailPage({ params }: { params: Promise<{ id: string; incidentId: string }> }) {
  const { id, incidentId } = await params;
  return <LostPetIncidentDetailView petId={id} incidentId={incidentId} />;
}
