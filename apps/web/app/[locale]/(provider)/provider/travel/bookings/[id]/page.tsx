import { ProviderTravelBookingDetailView } from "@/features/provider/travel/ProviderTravelViews";

export default async function ProviderTravelBookingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProviderTravelBookingDetailView bookingId={id} />;
}
