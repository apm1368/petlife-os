import { Suspense } from "react";
import { Skeleton } from "@petlife/ui";
import { BookingFlowView } from "@/features/booking-flow/BookingFlowView";

export default async function BookVetPage({ params }: { params: Promise<{ providerId: string }> }) {
  const { providerId } = await params;
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <BookingFlowView providerId={providerId} />
    </Suspense>
  );
}
