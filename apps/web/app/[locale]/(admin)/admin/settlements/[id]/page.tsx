import { Suspense } from "react";
import { AdminSettlementDetailView } from "@/features/admin/AdminSettlementDetailView";

export default async function AdminSettlementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <AdminSettlementDetailView settlementId={id} />
    </Suspense>
  );
}
