import { Suspense } from "react";
import { AdminOwnershipTransfersView } from "@/features/admin-ownership/AdminOwnershipTransfersView";

export default function AdminOwnershipTransfersPage() {
  return (
    <Suspense>
      <AdminOwnershipTransfersView />
    </Suspense>
  );
}
