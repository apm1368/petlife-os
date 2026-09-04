import { PublicLostPetView } from "@/features/lost-pet/PublicLostPetView";

export default async function PublicLostPetPage({ params }: { params: Promise<{ incidentId: string }> }) {
  const { incidentId } = await params;
  return <PublicLostPetView incidentId={incidentId} />;
}
