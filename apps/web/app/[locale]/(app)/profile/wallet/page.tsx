import { Suspense } from "react";
import { WalletView } from "@/features/wallet/WalletView";

export default function AccountWalletPage() {
  // WalletView reads ?trackId when the bank gateway sends the member back.
  return (
    <Suspense>
      <WalletView />
    </Suspense>
  );
}
