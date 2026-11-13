import { Suspense } from "react";
import { PartnerSupportCreateView } from "@/features/partner-support/PartnerSupportViews";

export default function Page() {
  // The form reads ?category= from the address (the business hub links straight to a topic).
  return (
    <Suspense>
      <PartnerSupportCreateView panel="provider" />
    </Suspense>
  );
}
