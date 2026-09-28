import { Suspense } from "react";
import { Skeleton } from "@petlife/ui";
import { ProductResultsView } from "@/features/commerce/ProductResultsView";

export default function ProductResultsPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96 w-full" />}>
      <ProductResultsView />
    </Suspense>
  );
}
