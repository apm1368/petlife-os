import { PlaceDetailView } from "@/features/places/PlaceDetailView";

export default async function PlaceDetailPage({ params }: { params: Promise<{ placeId: string }> }) {
  const { placeId } = await params;
  return <PlaceDetailView placeId={placeId} />;
}
