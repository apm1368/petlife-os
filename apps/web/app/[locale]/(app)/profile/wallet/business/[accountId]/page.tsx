import { Suspense } from "react";
import { WalletView } from "@/features/wallet/WalletView";

/** A partner organisation's business wallet; only its wallet managers can open it (anyone else gets a 404 from the API). */
export default async function BusinessWalletPage({ params }: { params: Promise<{ accountId: string }> }) {
  const { accountId } = await params;
  // WalletView reads ?trackId when the bank gateway sends the member back from a business top-up.
  return (
    <Suspense>
      <WalletView accountId={accountId} />
    </Suspense>
  );
}
