import { Suspense } from "react";
import { AdminDeletionRequestsView } from "@/features/admin-privacy/AdminDeletionRequestsView";

export default function AdminDeletionRequestsPage() {
  return (
    <Suspense>
      <AdminDeletionRequestsView />
    </Suspense>
  );
}
