import { AdminWalletDetailView } from "@/features/admin/wallets/AdminWalletViews";

export default async function AdminWalletDetailPage({ params }: { params: Promise<{ userId: string }> }) {
  const { userId } = await params;
  return <AdminWalletDetailView userId={userId} />;
}
