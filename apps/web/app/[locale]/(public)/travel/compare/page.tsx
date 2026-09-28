import { Suspense } from "react";
import type { Metadata } from "next";
import { Skeleton } from "@petlife/ui";
import { TravelCompareView } from "@/features/travel-market/TravelCompareView";

export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function TravelComparePage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <TravelCompareView />
    </Suspense>
  );
}
