import { AdminPartnerShopProfile } from "@/features/admin/partners/AdminPartnerProfileViews";

export default async function AdminShopPartnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminPartnerShopProfile id={id} />;
}
