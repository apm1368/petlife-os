import { Suspense } from "react";
import { InsuranceListView } from "@/features/insurance/InsuranceListView";
import { publicPageMetadata } from "@/lib/seo/public-metadata";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  return publicPageMetadata((await params).locale, "insurance");
}

export default function InsuranceListPage() {
  return (
    <Suspense>
      <InsuranceListView />
    </Suspense>
  );
}
