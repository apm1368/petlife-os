import { ProviderTravelListingEditor } from "@/features/provider/travel/ProviderTravelViews";

export default async function ProviderTravelListingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <ProviderTravelListingEditor listingId={id} />;
}
