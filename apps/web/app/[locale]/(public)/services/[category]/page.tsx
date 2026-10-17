import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Skeleton } from "@petlife/ui";
import { ProviderDiscoveryView } from "@/features/discovery/ProviderDiscoveryView";

const CATEGORIES = ["VET", "GROOMING", "TRAINING", "WALKING", "SITTING", "BOARDING", "PET_TAXI", "OTHER"];

export default async function ServiceResultsPage({ params }: { params: Promise<{ category: string }> }) {
  const { category } = await params;
  if (!CATEGORIES.includes(category)) notFound();
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ProviderDiscoveryView category={category} />
    </Suspense>
  );
}
