import { Suspense } from "react";
import { SellerSettlementDetailView } from "@/features/seller/SellerSettlementDetailView";

export default async function SellerFinanceSettlementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <SellerSettlementDetailView settlementId={id} />
    </Suspense>
  );
}
