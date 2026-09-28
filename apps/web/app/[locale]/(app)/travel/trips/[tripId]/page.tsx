import { TripHubView } from "@/features/travel-market/TripHubView";

export default async function TripHubPage({ params }: { params: Promise<{ tripId: string }> }) {
  const { tripId } = await params;
  return <TripHubView tripId={tripId} />;
}
