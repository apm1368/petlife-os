import { Suspense } from "react";
import { AdminSupportQueueView } from "@/features/admin/AdminSupportQueueView";

export default function AdminSupportPage() {
  // The queue reads its tab from the address (?requester=PARTNER), which needs a Suspense boundary.
  return (
    <Suspense>
      <AdminSupportQueueView />
    </Suspense>
  );
}
