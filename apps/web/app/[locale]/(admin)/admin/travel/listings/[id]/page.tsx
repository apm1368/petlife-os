import { AdminTravelListingDetailView } from "@/features/admin/travel/AdminTravelViews";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminTravelListingDetailView listingId={id} />;
}
