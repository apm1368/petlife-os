import { AdminPartnerServiceProfile } from "@/features/admin/partners/AdminPartnerProfileViews";

export default async function AdminServicePartnerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <AdminPartnerServiceProfile id={id} />;
}
