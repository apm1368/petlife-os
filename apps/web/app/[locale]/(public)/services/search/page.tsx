import { Suspense } from "react";
import { Skeleton } from "@petlife/ui";
import { ProviderDiscoveryView } from "@/features/discovery/ProviderDiscoveryView";

export default function ServiceSearchPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ProviderDiscoveryView />
    </Suspense>
  );
}
