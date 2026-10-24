import { Suspense } from "react";
import { Skeleton } from "@petlife/ui";
import { BookingFlowView } from "@/features/booking-flow/BookingFlowView";

/** Anonymous visitors can choose a service and see real availability; sign-in is requested when a time is held. */
export default async function ProviderBookingPage({ params }: { params: Promise<{ providerId: string }> }) {
  const { providerId } = await params;
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <BookingFlowView providerId={providerId} />
    </Suspense>
  );
}
