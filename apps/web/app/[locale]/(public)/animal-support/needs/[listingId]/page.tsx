import { SupportNeedDetailView } from "@/features/animal-support/SupportNeedDetailView";

export default async function SupportNeedDetailPage({ params }: { params: Promise<{ listingId: string }> }) {
  const { listingId } = await params;
  return <SupportNeedDetailView listingId={listingId} />;
}
