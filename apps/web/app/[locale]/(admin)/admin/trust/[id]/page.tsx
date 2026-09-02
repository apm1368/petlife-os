import { Suspense } from "react";
import { AdminTrustCaseDetailView } from "@/features/admin/AdminTrustCaseDetailView";

export default async function AdminTrustCaseDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <AdminTrustCaseDetailView trustCaseId={id} />
    </Suspense>
  );
}
