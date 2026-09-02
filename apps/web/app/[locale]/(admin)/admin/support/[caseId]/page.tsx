import { Suspense } from "react";
import { AdminSupportCaseDetailView } from "@/features/admin/AdminSupportCaseDetailView";

export default async function AdminSupportCaseDetailPage({ params }: { params: Promise<{ caseId: string }> }) {
  const { caseId } = await params;
  return (
    <Suspense>
      <AdminSupportCaseDetailView caseId={caseId} />
    </Suspense>
  );
}
