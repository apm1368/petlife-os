import { AdminWalletAccountView } from "@/features/admin/wallets/AdminWalletTransferViews";

export default async function AdminWalletAccountPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminWalletAccountView id={id} />;
}
