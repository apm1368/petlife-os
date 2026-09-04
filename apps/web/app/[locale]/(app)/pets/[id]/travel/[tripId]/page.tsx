import { TripDetailView } from "@/features/travel/TripDetailView";

export default async function TripDetailPage({ params }: { params: Promise<{ id: string; tripId: string }> }) {
  const { id, tripId } = await params;
  return <TripDetailView petId={id} tripId={tripId} />;
}
