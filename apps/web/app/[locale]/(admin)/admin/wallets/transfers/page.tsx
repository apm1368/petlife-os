import { Suspense } from "react";
import { AdminWalletTransfersView } from "@/features/admin/wallets/AdminWalletTransferViews";

export default function AdminWalletTransfersPage() {
  // The form reads ?new=1&fromType=…&fromId=… when opened from a wallet page.
  return (
    <Suspense>
      <AdminWalletTransfersView />
    </Suspense>
  );
}
