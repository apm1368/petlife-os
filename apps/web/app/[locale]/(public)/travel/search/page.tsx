import { Suspense } from "react";
import type { Metadata } from "next";
import { Skeleton } from "@petlife/ui";
import { TravelResultsView } from "@/features/travel-market/TravelResultsView";

/** Faceted result pages are endless URL permutations: crawl through them, never index them. */
export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function TravelSearchPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <TravelResultsView />
    </Suspense>
  );
}
