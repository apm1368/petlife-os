import { Suspense } from "react";
import { Skeleton } from "@petlife/ui";
import { ProviderDiscoveryView } from "@/features/discovery/ProviderDiscoveryView";

/** Vet discovery is the same discovery pattern restricted to veterinary services. */
export default function FindVetPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ProviderDiscoveryView category="VET" />
    </Suspense>
  );
}
