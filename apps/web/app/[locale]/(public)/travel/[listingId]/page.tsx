import { TravelListingDetailView } from "@/features/travel/TravelListingDetailView";

export default async function TravelListingPage({ params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await params;
  return <TravelListingDetailView listingId={listingId} />;
}
