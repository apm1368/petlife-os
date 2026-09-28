import { Suspense } from "react";
import { Skeleton } from "@petlife/ui";
import { RepeatDeliveryCreateView } from "@/features/commerce/RepeatDeliveryViews";

export default function NewRepeatDeliveryPage() {
  return (
    <Suspense fallback={<Skeleton className="h-64 w-full" />}>
      <RepeatDeliveryCreateView />
    </Suspense>
  );
}
