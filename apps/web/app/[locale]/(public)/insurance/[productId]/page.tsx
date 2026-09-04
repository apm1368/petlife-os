import { Suspense } from "react";
import { InsuranceProductDetailView } from "@/features/insurance/InsuranceProductDetailView";

export default async function InsuranceProductDetailPage({ params }: { params: Promise<{ productId: string }> }) {
  const { productId } = await params;
  return (
    <Suspense>
      <InsuranceProductDetailView productId={productId} />
    </Suspense>
  );
}
