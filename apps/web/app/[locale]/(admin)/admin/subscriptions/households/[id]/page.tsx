import { Suspense } from "react";
import { AdminSubscriptionHouseholdDetailView } from "@/features/admin/AdminSubscriptionHouseholdDetailView";

export default async function AdminSubscriptionHouseholdDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <Suspense>
      <AdminSubscriptionHouseholdDetailView householdId={id} />
    </Suspense>
  );
}
