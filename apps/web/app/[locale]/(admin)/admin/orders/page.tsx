import { Suspense } from "react";
import { AdminOrdersView } from "@/features/admin-orders/AdminOrdersView";

export default function AdminOrdersPage() {
  return (
    <Suspense>
      <AdminOrdersView section="ALL" />
    </Suspense>
  );
}
