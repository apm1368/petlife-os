import { Suspense } from "react";
import { Skeleton } from "@petlife/ui";
import { MyBookingsView } from "@/features/bookings/MyBookingsView";

export default function MyBookingsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-48 w-full" />}>
      <MyBookingsView />
    </Suspense>
  );
}
