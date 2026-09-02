import { Suspense } from "react";
import { SellerOrderDetailView } from "@/features/seller/SellerOrderDetailView";

export default async function SellerOrderDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <SellerOrderDetailView orderId={id} />
    </Suspense>
  );
}
