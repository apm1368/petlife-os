import { Suspense } from "react";
import { ProviderBookingDetailView } from "@/features/provider/ProviderBookingDetailView";

export default async function ProviderBookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <ProviderBookingDetailView bookingId={id} />
    </Suspense>
  );
}
