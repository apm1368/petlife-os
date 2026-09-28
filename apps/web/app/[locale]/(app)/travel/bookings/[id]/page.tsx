import { TravelBookingDetailView } from "@/features/travel-market/TravelBookingDetailView";

export default async function TravelBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <TravelBookingDetailView bookingId={id} />;
}
