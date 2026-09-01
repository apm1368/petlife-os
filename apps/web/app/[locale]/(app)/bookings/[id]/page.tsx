import { Suspense } from "react";
import { BookingDetailView } from "@/features/vet/BookingDetailView";

export default async function BookingDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <BookingDetailView bookingId={id} />
    </Suspense>
  );
}
