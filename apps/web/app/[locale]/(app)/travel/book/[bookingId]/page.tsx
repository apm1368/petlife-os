import { TravelBookingFlowView } from "@/features/travel-market/TravelBookingFlowView";

export default async function TravelBookPage({ params }: { params: Promise<{ bookingId: string }> }) {
  const { bookingId } = await params;
  return <TravelBookingFlowView bookingId={bookingId} />;
}
