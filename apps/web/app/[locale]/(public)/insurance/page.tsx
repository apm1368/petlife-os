import { Suspense } from "react";
import { InsuranceListView } from "@/features/insurance/InsuranceListView";

export default function InsuranceListPage() {
  return (
    <Suspense>
      <InsuranceListView />
    </Suspense>
  );
}
