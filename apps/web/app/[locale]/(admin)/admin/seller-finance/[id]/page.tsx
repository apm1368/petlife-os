import { Suspense } from "react";
import { AdminSellerFinanceDetailView } from "@/features/admin/AdminSellerFinanceDetailView";

export default async function AdminSellerFinanceDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <AdminSellerFinanceDetailView sellerId={id} />
    </Suspense>
  );
}
