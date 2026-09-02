import { Suspense } from "react";
import { AdminDisputeDetailView } from "@/features/admin/AdminDisputeDetailView";

export default async function AdminDisputeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <AdminDisputeDetailView disputeId={id} />
    </Suspense>
  );
}
