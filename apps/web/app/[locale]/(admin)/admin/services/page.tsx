import { Suspense } from "react";
import { AdminServiceBookingsView } from "@/features/admin/services/AdminServicesViews";

export default function AdminServicesPage() {
  return (
    <Suspense>
      <AdminServiceBookingsView />
    </Suspense>
  );
}
