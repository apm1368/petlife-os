import { TravelBookingCheckoutView } from "@/features/travel/TravelBookingCheckoutView";

export default async function TravelBookingCheckoutPage({ params }: { params: Promise<{ id: string; listingId: string }> }) {
  const { id, listingId } = await params;
  return <TravelBookingCheckoutView petId={id} listingId={listingId} />;
}
